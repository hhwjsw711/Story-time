import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { authenticateToken } from "./agentTokens";
import {
  assertNotArchived,
  getEventAccessFor,
  requireEventAccessFor,
  type EventRole,
} from "./lib/access";
import { invalid, localKeys } from "./lib/blocks";
import { MAX_BLOCKS_PER_MOMENT } from "./lib/limits";
import { MOODS } from "./mcpTools";
import {
  createMoment,
  viewMoment,
  writeMomentUpdate,
  type MomentCreate,
  type MomentEdit,
  type PlainBlock,
  type PlainStop,
} from "./moments";
import { vTransport } from "./schema";

// The tools behind the assistant connection (MCP). Each one runs in a single
// transaction with the token check, so the rate limit and the work commit
// together. They are called only from http.ts, which checks the arguments first.

type Caller = Awaited<ReturnType<typeof authenticateToken>>;
type View = Awaited<ReturnType<typeof viewMoment>>;

const NO_EXPERIENCE = "No experience with that id. Call list_experiences first.";
const NO_MOMENT = "No moment with that id. Call list_moments first.";
const LIST_LIMIT = 50;
const DEFAULT_MOMENTS = 20;
const MAX_MOMENTS = 50;
// A note in a list is cut to this many characters, with an ellipsis.
const NOTE_CUT = 300;
const MAX_DATE_MS = 8.64e15;
const MAX_OFFSET_MINUTES = 14 * 60;

const vExperience = v.object({
  id: v.id("events"),
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.optional(v.string()),
  endsAt: v.optional(v.string()),
  momentCount: v.number(),
  role: v.union(v.literal("owner"), v.literal("contributor")),
});

const vWho = v.union(
  v.object({ kind: v.literal("person"), name: v.optional(v.string()) }),
  v.object({ kind: v.literal("agent"), name: v.string() }),
);

const vMomentSummary = v.object({
  id: v.id("moments"),
  when: v.string(),
  place: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  transport: v.optional(vTransport),
  labels: v.array(v.string()),
  notes: v.array(v.string()),
  stops: v.number(),
  photos: v.number(),
  by: vWho,
  editedBy: v.optional(vWho),
});

const vWritten = v.object({ id: v.id("moments"), summary: v.string() });

function notFound(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "NOT_FOUND", message });
}

// requireEventAccessFor says "Event not found" for missing and forbidden alike.
// Turned into the tool's own message here, so a caller can't tell them apart.
async function accessTo(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
  min: EventRole,
  missing: string,
) {
  try {
    return await requireEventAccessFor(ctx, userId, eventId, min);
  } catch (e) {
    if (e instanceof Error && e.message === "Event not found") throw notFound(missing);
    throw e;
  }
}

// The experience a tool may use. Missing, out of reach and outside the
// connection's own experience all read the same.
async function experienceFor(
  ctx: MutationCtx,
  caller: Caller,
  experienceId: string,
  min: EventRole,
) {
  const eventId = ctx.db.normalizeId("events", experienceId);
  if (eventId === null || (caller.eventId !== undefined && caller.eventId !== eventId)) {
    throw notFound(NO_EXPERIENCE);
  }
  return accessTo(ctx, caller.userId, eventId, min, NO_EXPERIENCE);
}

// Experiences this connection may add to: the person's own and those they help
// with, not archived. A connection limited to one experience sees only that one.
async function writableExperiences(
  ctx: MutationCtx,
  caller: Caller,
): Promise<Array<{ event: Doc<"events">; role: "owner" | "contributor" }>> {
  if (caller.eventId !== undefined) {
    const access = await getEventAccessFor(ctx, caller.userId, caller.eventId);
    if (access === null || access.role === "viewer" || access.event.status === "archived") return [];
    return [{ event: access.event, role: access.role }];
  }

  const found: Array<{ event: Doc<"events">; role: "owner" | "contributor" }> = [];
  const owned = await ctx.db
    .query("events")
    .withIndex("by_owner", (q) => q.eq("ownerId", caller.userId))
    .order("desc")
    .take(100);
  const ownedIds = new Set<Id<"events">>(owned.map((event) => event._id));
  for (const event of owned) {
    if (event.status !== "archived") found.push({ event, role: "owner" });
  }
  const grants = await ctx.db
    .query("sessions")
    .withIndex("by_user", (q) => q.eq("userId", caller.userId))
    .take(100);
  for (const grant of grants) {
    if (grant.revokedAt !== undefined || grant.role !== "contributor") continue;
    if (ownedIds.has(grant.eventId)) continue;
    const event = await ctx.db.get("events", grant.eventId);
    if (event !== null && event.status !== "archived") found.push({ event, role: "contributor" });
  }
  return found.slice(0, LIST_LIMIT);
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_MOMENTS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_MOMENTS);
}

// ISO 8601 in UTC, or undefined when there is no date or it can't be shown.
function isoOf(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return undefined;
  return new Date(ms).toISOString();
}

// Cut by characters, not UTF-16 units, so an emoji is never split.
function cut(text: string): string {
  const chars = Array.from(text);
  return chars.length <= NOTE_CUT ? text : `${chars.slice(0, NOTE_CUT - 1).join("")}…`;
}

function notesIn(blocks: PlainBlock[]): string[] {
  return blocks.flatMap((b) => (b.type === "note" || b.type === "feeling" ? [cut(b.text)] : []));
}

function isPhoto(block: PlainBlock): boolean {
  return block.type === "photo" || block.type === "video";
}

function authorOf(view: View): { kind: "person"; name?: string } | { kind: "agent"; name: string } {
  return view.authorAgent === undefined
    ? { kind: "person", name: view.authorName }
    : { kind: "agent", name: view.authorAgent };
}

function editorOf(view: View): { kind: "person"; name?: string } | { kind: "agent"; name: string } {
  return view.editedByAgent === undefined
    ? { kind: "person", name: view.editedByName }
    : { kind: "agent", name: view.editedByAgent };
}

// A moment as an assistant reads it: compact, with the notes in full (cut) and
// the photos counted, not shown.
function summaryOf(view: View) {
  const lists: PlainBlock[][] = [view.blocks, ...view.stops.map((s) => s.blocks)];
  return {
    id: view._id,
    when: isoOf(view.startsAt) ?? "unknown date",
    place: view.place,
    lat: view.geo?.lat,
    lng: view.geo?.lng,
    transport: view.transport,
    labels: view.labels,
    notes: lists.flatMap(notesIn),
    // Stops after the first, the same count add_moment takes.
    stops: view.stops.length,
    photos: lists.reduce((n, blocks) => n + blocks.filter(isPhoto).length, 0),
    by: authorOf(view),
    editedBy: view.editedAt === undefined ? undefined : editorOf(view),
  };
}

const text = (s: string | undefined) => (s ?? "").trim();
const num = (s: string | undefined) => (s === undefined ? 0 : Number(s));

function invalidWhen(): never {
  invalid(
    "when",
    "Use a date like 2026-06-01, or a time like 2026-06-01T14:30 (add +02:00 for another time zone).",
  );
}

// A UTC instant for these parts, or undefined for a date that doesn't exist.
function instantOf(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number) {
  if (h > 23 || mi > 59 || s > 59) return undefined;
  const at = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const back = new Date(at);
  const same =
    back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
  return same ? at : undefined;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// ISO 8601, with a space or T between date and time, optional seconds and
// fraction, and an optional Z or +hh:mm offset.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?$/i;

// When a moment started, as an instant, and the offset the author was at (minutes
// east of UTC). A bare date is noon; a time with no offset is taken as UTC.
function parseWhen(
  when: string | undefined,
  now: number,
): { startsAt: number; tzOffsetMinutes: number } {
  if (when === undefined) return { startsAt: now, tzOffsetMinutes: 0 };
  const s = when.trim();
  const date = DATE_ONLY.exec(s);
  if (date !== null) {
    const at = instantOf(num(date[1]), num(date[2]), num(date[3]), 12, 0, 0, 0);
    if (at === undefined) invalidWhen();
    return { startsAt: at, tzOffsetMinutes: 0 };
  }
  const m = DATE_TIME.exec(s);
  if (m === null) invalidWhen();
  const at = instantOf(
    num(m[1]),
    num(m[2]),
    num(m[3]),
    num(m[4]),
    num(m[5]),
    num(m[6]),
    m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0")),
  );
  if (at === undefined) invalidWhen();
  const sign = m[9];
  const offset =
    sign === undefined ? 0 : (sign === "-" ? -1 : 1) * (num(m[10]) * 60 + num(m[11]));
  if (Math.abs(offset) > MAX_OFFSET_MINUTES) invalidWhen();
  return { startsAt: at - offset * 60_000, tzOffsetMinutes: offset };
}

// Coordinates come as a pair. Whether they have a place is checked where the
// place is written (encodeGeo).
function pinOf(
  lat: number | undefined,
  lng: number | undefined,
  field: string,
): { lat: number; lng: number } | undefined {
  if (lat === undefined && lng === undefined) return undefined;
  if (lat === undefined || lng === undefined) invalid(field, "Send lat and lng together, or neither.");
  return { lat, lng };
}

function moodOf(mood: string | undefined): (typeof MOODS)[number] | undefined {
  if (mood === undefined) return undefined;
  const found = MOODS.find((m) => m === mood);
  if (found === undefined) invalid("mood", "Pick one of the app's moods: 😊 😍 😌 😂 🥹 😴.");
  return found;
}

// Lists the experiences the person can add to. Read-only, but it runs as a
// mutation so the token's rate limit is counted in the same transaction.
export const list_experiences = internalMutation({
  args: { token: v.string() },
  returns: v.array(vExperience),
  handler: async (ctx, args) => {
    const caller = await authenticateToken(ctx, args.token);
    const found = await writableExperiences(ctx, caller);
    return found.map(({ event, role }) => ({
      id: event._id,
      title: event.title,
      description: event.description,
      startsAt: isoOf(event.startsAt),
      endsAt: isoOf(event.endsAt),
      momentCount: event.momentCount,
      role,
    }));
  },
});

// The most recent moments of one experience, as a viewer can see them.
export const list_moments = internalMutation({
  args: {
    token: v.string(),
    experienceId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(vMomentSummary),
  handler: async (ctx, args) => {
    const caller = await authenticateToken(ctx, args.token);
    const { event } = await experienceFor(ctx, caller, args.experienceId, "viewer");
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .order("desc")
      .take(clampLimit(args.limit));
    const views = await Promise.all(moments.map((m) => viewMoment(ctx, event, m)));
    return views.map(summaryOf);
  },
});

// Adds a moment, labelled as the assistant's, for the person it works for.
export const add_moment = internalMutation({
  args: {
    token: v.string(),
    experienceId: v.string(),
    when: v.optional(v.string()),
    place: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    note: v.optional(v.string()),
    mood: v.optional(v.string()),
    transport: v.optional(vTransport),
    labels: v.optional(v.array(v.string())),
    links: v.optional(
      v.array(v.object({ url: v.string(), title: v.optional(v.string()) })),
    ),
    stops: v.optional(
      v.array(
        v.object({
          when: v.optional(v.string()),
          place: v.optional(v.string()),
          lat: v.optional(v.number()),
          lng: v.optional(v.number()),
          transport: v.optional(vTransport),
          note: v.optional(v.string()),
        }),
      ),
    ),
  },
  returns: vWritten,
  handler: async (ctx, args) => {
    const caller = await authenticateToken(ctx, args.token);
    const { event } = await experienceFor(ctx, caller, args.experienceId, "contributor");
    const now = Date.now();
    const first = parseWhen(args.when, now);

    // A note with a mood is a feeling; without one, a plain note.
    const mood = moodOf(args.mood);
    const diary = text(args.note);
    if (mood !== undefined && diary === "") {
      invalid("note", "Add a few words to go with the mood.");
    }
    const blocks: PlainBlock[] = [
      ...(args.links ?? []).map((link) => ({ type: "link" as const, url: link.url, title: link.title })),
      ...(diary === ""
        ? []
        : [mood === undefined ? { type: "note" as const, text: diary } : { type: "feeling" as const, text: diary, mood }]),
    ];

    const stops: PlainStop[] = (args.stops ?? []).map((stop, i) => {
      const stopNote = text(stop.note);
      return {
        startsAt: stop.when === undefined ? undefined : parseWhen(stop.when, now).startsAt,
        place: stop.place,
        geo: pinOf(stop.lat, stop.lng, `stops.${i}.geo`),
        transport: stop.transport,
        blocks: stopNote === "" ? [] : [{ type: "note", text: stopNote }],
      };
    });

    const hasSomethingToShow =
      blocks.length > 0 || stops.some((stop) => stop.blocks.length > 0);
    if (!hasSomethingToShow) {
      invalid("note", "Add a note or a link so the moment has something to show.");
    }

    const input: MomentCreate = {
      eventId: event._id,
      startsAt: first.startsAt,
      tzOffsetMinutes: first.tzOffsetMinutes,
      place: args.place,
      geo: pinOf(args.lat, args.lng, "geo"),
      blocks,
      transport: args.transport,
      stops: stops.length > 0 ? stops : undefined,
      labels: args.labels,
    };
    const id = await createMoment(ctx, {
      event,
      userId: caller.userId,
      actor: { kind: "agent", name: caller.name, onBehalfOf: caller.userId },
      input,
    });

    const day = localKeys(first.startsAt, first.tzOffsetMinutes).dayKey;
    const place = text(args.place);
    const where = place === "" ? "" : ` at ${place}`;
    const more =
      stops.length === 0 ? "" : `, with ${stops.length} more ${stops.length === 1 ? "stop" : "stops"}`;
    return { id, summary: `Added a moment${where} on ${day}${more}.` };
  },
});

// Changes a moment the person may edit. Only what is passed changes. Nothing
// is ever removed: there is no delete.
export const update_moment = internalMutation({
  args: {
    token: v.string(),
    momentId: v.string(),
    when: v.optional(v.string()),
    place: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    transport: v.optional(v.union(vTransport, v.null())),
    labels: v.optional(v.array(v.string())),
    addNote: v.optional(v.string()),
  },
  returns: vWritten,
  handler: async (ctx, args) => {
    const caller = await authenticateToken(ctx, args.token);
    const momentId = ctx.db.normalizeId("moments", args.momentId);
    const moment = momentId === null ? null : await ctx.db.get("moments", momentId);
    // A moment outside the connection's own experience reads as missing.
    if (moment === null || (caller.eventId !== undefined && caller.eventId !== moment.eventId)) {
      throw notFound(NO_MOMENT);
    }
    const { event, role } = await accessTo(
      ctx,
      caller.userId,
      moment.eventId,
      "contributor",
      NO_MOMENT,
    );
    // The same rule as moments.update: a helper edits their own moments, while
    // the owner of the experience edits any.
    if (role !== "owner" && moment.authorId !== caller.userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only change moments you added yourself.",
      });
    }
    assertNotArchived(event);

    const view = await viewMoment(ctx, event, moment);
    const patch: MomentEdit = {};
    const changed: string[] = [];
    if (args.when !== undefined) {
      const when = parseWhen(args.when, Date.now());
      patch.startsAt = when.startsAt;
      patch.tzOffsetMinutes = when.tzOffsetMinutes;
      changed.push("when");
    }
    const pin = pinOf(args.lat, args.lng, "lat");
    if (args.place !== undefined) {
      // As in the app: a new place without coordinates drops the old pin.
      patch.place = args.place;
      patch.geo = pin;
      changed.push("place");
    } else if (pin !== undefined) {
      if (view.place === undefined) invalid("lat", "Pick a place to pin on the map.");
      patch.place = view.place;
      patch.geo = pin;
      changed.push("place");
    }
    if (args.transport !== undefined) {
      patch.transport = args.transport;
      changed.push("transport");
    }
    if (args.labels !== undefined) {
      patch.labels = args.labels;
      changed.push("labels");
    }
    if (args.addNote !== undefined) {
      const note = text(args.addNote);
      if (note === "") invalid("addNote", "Write the note to add.");
      if (view.blocks.length >= MAX_BLOCKS_PER_MOMENT) {
        throw new ConvexError({
          code: "FULL",
          message: "The first stop already holds as many items as it can, so the note doesn't fit.",
        });
      }
      // The first stop's text and photos stay as they are; the note comes last.
      patch.blocks = [...view.blocks, { type: "note", text: note }];
      changed.push("note");
    }
    if (changed.length === 0) {
      throw new ConvexError({
        code: "INVALID",
        field: "changes",
        message: "Say what to change: when, place, lat and lng, transport, labels or addNote.",
      });
    }

    await writeMomentUpdate(ctx, {
      event,
      moment,
      userId: caller.userId,
      actor: { kind: "agent", name: caller.name, onBehalfOf: caller.userId },
      patch,
    });
    return { id: moment._id, summary: `Updated the moment: ${changed.join(", ")}.` };
  },
});

// Checks a connection without doing anything else. initialize and tools/list
// use it, so a bad token is refused before any answer is given.
export const ping = internalMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authenticateToken(ctx, args.token);
    return null;
  },
});
