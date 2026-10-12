import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { invalid } from "./lib/blocks";
import { decryptText, encryptText } from "./lib/crypto";
import {
  coverPage,
  DECOS,
  type JournalElement,
  MAX_ELEMENT_TEXT,
  MAX_JOURNAL_PAGES,
  MAX_PAGE_ELEMENTS,
  momentPage,
  NOTE_STYLES,
  onPage,
  PAPERS,
  PRINT_STYLES,
  rangeLabel,
  TITLE_STYLES,
  TONES,
} from "./lib/journal";
import { MOMENT_LIMIT } from "./lib/limits";
import { viewMoment } from "./moments";
import { vJournalKind } from "./schema";

// The journal of an experience: a book of A4 pages made from its moments and
// then cut, taped and written on by its owner. Anyone who can see the
// experience can read it; only the owner changes it, and not once it, or the
// page, is locked.

const vElement = v.object({
  id: v.string(),
  kind: vJournalKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  rotation: v.number(),
  z: v.number(),
  style: v.optional(v.string()),
  text: v.optional(v.string()),
  tone: v.optional(v.string()),
  mediaId: v.optional(v.id("media")),
  momentId: v.optional(v.id("moments")),
  locked: v.optional(v.boolean()),
});
type ElementIn = Infer<typeof vElement>;

// A laid-out element with the ids it was made from, typed as the table's.
const fromLayout = (elements: JournalElement[]): ElementIn[] =>
  elements.map((e) => ({ ...e, mediaId: e.mediaId as Id<"media"> | undefined, momentId: e.momentId as Id<"moments"> | undefined }));

const vPageView = v.object({
  _id: v.id("journalPages"),
  order: v.number(),
  paper: v.string(),
  locked: v.boolean(),
  momentId: v.optional(v.id("moments")),
  elements: v.array(vElement),
});

const STYLES: Record<ElementIn["kind"], ReadonlySet<string> | null> = {
  photo: new Set(PRINT_STYLES),
  sticker: null,
  title: new Set(TITLE_STYLES),
  note: new Set(NOTE_STYLES),
  deco: new Set(DECOS),
  map: null,
};
const PAPER_SET = new Set<string>(PAPERS);
const TONE_SET = new Set<string>(TONES);

const notFound = () => new ConvexError({ code: "NOT_FOUND", message: "That page isn't here any more." });

async function journalOf(ctx: QueryCtx, eventId: Id<"events">) {
  return ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
}

async function pagesOf(ctx: QueryCtx, eventId: Id<"events">) {
  return ctx.db
    .query("journalPages")
    .withIndex("by_event_and_order", (q) => q.eq("eventId", eventId))
    .take(MAX_JOURNAL_PAGES + 1);
}

// A page to change, with the experience it is in. Only the owner, never on an
// archived experience, and never while the page or the journal is locked
// (`unlocking` lets the lock itself be taken off).
async function editablePage(ctx: MutationCtx, pageId: Id<"journalPages">, unlocking = false) {
  const page = await ctx.db.get("journalPages", pageId);
  if (page === null) throw notFound();
  const { event } = await requireEventAccess(ctx, page.eventId, "owner");
  assertNotArchived(event);
  const journal = await journalOf(ctx, event._id);
  if (journal?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
  if (page.locked && !unlocking) throw new ConvexError({ code: "LOCKED", message: "This page is locked. Unlock it to change it." });
  return { page, event };
}

// Checks what a page holds and encrypts its words. With `drop`, anything that
// doesn't belong (a photo from another experience, an unknown style) is left
// out instead of refused: that is how an imported journal comes in.
async function encodeElements(
  ctx: QueryCtx,
  event: Doc<"events">,
  elements: ElementIn[],
  drop = false,
): Promise<Doc<"journalPages">["elements"]> {
  if (elements.length > MAX_PAGE_ELEMENTS) invalid("elements", `A page holds up to ${MAX_PAGE_ELEMENTS} things.`);
  const media = new Map<string, Doc<"media"> | null>();
  const moments = new Map<string, Doc<"moments"> | null>();
  const mediaOf = async (id: Id<"media">) => {
    if (!media.has(id)) media.set(id, await ctx.db.get("media", id));
    return media.get(id) ?? null;
  };
  const momentOf = async (id: Id<"moments">) => {
    if (!moments.has(id)) moments.set(id, await ctx.db.get("moments", id));
    return moments.get(id) ?? null;
  };
  const seen = new Set<string>();
  const out: Doc<"journalPages">["elements"] = [];
  for (const e of elements) {
    const problem = await problemWith(e);
    if (problem !== undefined) {
      if (drop) continue;
      invalid("elements", problem);
    }
    seen.add(e.id);
    const text = e.text === undefined || e.text.trim() === "" ? undefined : await encryptText(event._id, event.keyVersion, e.text);
    out.push({ ...e, rotation: e.rotation % 360, text });
  }
  return out;

  async function problemWith(e: ElementIn): Promise<string | undefined> {
    if (e.id.length === 0 || e.id.length > 40 || seen.has(e.id)) return "Each thing on a page needs its own id.";
    if (![e.x, e.y, e.w, e.h, e.z].every(onPage) || !Number.isFinite(e.rotation)) return "That doesn't fit on a page.";
    if (e.w < 4 || e.h < 4) return "That is too small to see.";
    const styles = STYLES[e.kind];
    if (e.style !== undefined && (styles === null || !styles.has(e.style))) return `There is no ${e.kind} style called "${e.style}".`;
    if (e.tone !== undefined && !TONE_SET.has(e.tone)) return "That tone doesn't exist.";
    if (e.text !== undefined && e.text.length > MAX_ELEMENT_TEXT) return `Words on a page are at most ${MAX_ELEMENT_TEXT} characters.`;
    const pictured = e.kind === "photo" || e.kind === "sticker";
    if (pictured !== (e.mediaId !== undefined)) return pictured ? "A photo needs a picture." : "Only photos and stickers show a picture.";
    if (e.mediaId !== undefined) {
      const m = await mediaOf(e.mediaId);
      const ok =
        m !== null &&
        m.eventId === event._id &&
        m.status === "ready" &&
        m.mime.startsWith("image/") &&
        (e.kind === "sticker" ? m.purpose === "sticker" : m.momentId !== undefined || m.purpose === "sticker");
      if (!ok) return "That photo isn't in this experience.";
    }
    if ((e.kind === "map") !== (e.momentId !== undefined)) return e.kind === "map" ? "A map shows a moment's stops." : "Only a map points at a moment.";
    if (e.momentId !== undefined) {
      const m = await momentOf(e.momentId);
      if (m === null || m.eventId !== event._id) return "That moment isn't in this experience.";
    }
    return undefined;
  }
}

async function viewPage(event: Doc<"events">, page: Doc<"journalPages">) {
  return {
    _id: page._id,
    order: page.order,
    paper: page.paper,
    locked: page.locked ?? false,
    momentId: page.momentId,
    elements: await Promise.all(
      page.elements.map(async (e) => ({ ...e, text: e.text === undefined ? undefined : await decryptText(event._id, e.text) })),
    ),
  };
}

// The journal and its pages, in order. `pending` is how many moments don't
// have a page yet, for the owner, whose page then calls `fill`.
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    canEdit: v.boolean(),
    locked: v.boolean(),
    pending: v.number(),
    pages: v.array(vPageView),
  }),
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const canEdit = role === "owner" && event.status !== "archived";
    let pending = 0;
    if (canEdit && !journal?.locked) {
      const moments = await ctx.db
        .query("moments")
        .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
        .take(MOMENT_LIMIT);
      pending = moments.filter((m) => journal?.filledAt === undefined || m._creationTime > journal.filledAt).length;
      // A brand-new journal still gets its cover.
      if (journal === null) pending = Math.max(pending, 1);
    }
    const pages = await Promise.all((await pagesOf(ctx, event._id)).slice(0, MAX_JOURNAL_PAGES).map((p) => viewPage(event, p)));
    return { canEdit, locked: journal?.locked ?? false, pending, pages };
  },
});

// Gives every moment made since the last fill a page of its own, and a new
// journal its cover. Safe to call from two windows at once: the second finds
// nothing new.
export const fill = mutation({
  args: { eventId: v.id("events") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    let journal = await journalOf(ctx, event._id);
    if (journal?.locked) return 0;
    const first = journal === null;
    if (journal === null) {
      const id = await ctx.db.insert("journals", { eventId: event._id });
      journal = (await ctx.db.get("journals", id))!;
    }
    const rows = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(MOMENT_LIMIT);
    const fresh = rows.filter((m) => journal.filledAt === undefined || m._creationTime > journal.filledAt);
    let room = MAX_JOURNAL_PAGES - (await pagesOf(ctx, event._id)).length;
    let made = 0;

    if (first && room > 0) {
      const views = rows.length === 0 ? [] : [await viewMoment(ctx, event, rows[0]!)];
      const photo = views[0] && [views[0].blocks, ...views[0].stops.map((s) => s.blocks)].flat().find((b) => b.type === "photo");
      const from = event.startsAt ?? rows[0]?.startsAt;
      const to = event.endsAt ?? rows.at(-1)?.startsAt ?? from;
      const cover = coverPage({
        id: event._id,
        title: event.title,
        dates: from === undefined ? undefined : rangeLabel(from, to ?? from),
        photo: photo?.type === "photo" ? photo.mediaId : undefined,
      });
      await ctx.db.insert("journalPages", { eventId: event._id, order: 0, paper: cover.paper, elements: await encodeElements(ctx, event, fromLayout(cover.elements)) });
      room--;
      made++;
    }

    for (const row of fresh) {
      if (room <= 0) break;
      const has = await ctx.db
        .query("journalPages")
        .withIndex("by_event_and_moment", (q) => q.eq("eventId", event._id).eq("momentId", row._id))
        .first();
      if (has !== null) continue;
      const moment = await viewMoment(ctx, event, row);
      const spec = momentPage({ ...moment, stops: moment.stops }, rows.indexOf(row));
      await ctx.db.insert("journalPages", {
        eventId: event._id,
        order: row.startsAt,
        paper: spec.paper,
        momentId: row._id,
        elements: await encodeElements(ctx, event, fromLayout(spec.elements), true),
      });
      room--;
      made++;
    }
    const newest = rows.reduce((top, m) => Math.max(top, m._creationTime), journal.filledAt ?? 0);
    await ctx.db.patch("journals", journal._id, { filledAt: newest });
    return made;
  },
});

// Saves what is on a page (all of it: a page is small), and its paper.
export const savePage = mutation({
  args: { pageId: v.id("journalPages"), paper: v.optional(v.string()), elements: v.array(vElement) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId);
    if (args.paper !== undefined && !PAPER_SET.has(args.paper)) invalid("paper", "That paper doesn't exist.");
    await ctx.db.patch("journalPages", page._id, {
      paper: args.paper ?? page.paper,
      elements: await encodeElements(ctx, event, args.elements),
    });
    return null;
  },
});

// Where a page goes between two others (or after the last).
const between = (before: number | undefined, after: number | undefined) =>
  before === undefined ? (after === undefined ? 0 : after - 60_000) : after === undefined ? before + 60_000 : (before + after) / 2;

// A blank page after `after` (or at the end).
export const addPage = mutation({
  args: { eventId: v.id("events"), after: v.optional(v.id("journalPages")), paper: v.optional(v.string()) },
  returns: v.id("journalPages"),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
    if (args.paper !== undefined && !PAPER_SET.has(args.paper)) invalid("paper", "That paper doesn't exist.");
    const pages = await pagesOf(ctx, event._id);
    if (pages.length >= MAX_JOURNAL_PAGES) throw new ConvexError({ code: "FULL", message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.` });
    const at = args.after === undefined ? pages.length - 1 : pages.findIndex((p) => p._id === args.after);
    const order = between(pages[at]?.order, pages[at + 1]?.order);
    return ctx.db.insert("journalPages", { eventId: event._id, order, paper: args.paper ?? "cream", elements: [] });
  },
});

export const removePage = mutation({
  args: { pageId: v.id("journalPages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page } = await editablePage(ctx, args.pageId);
    await ctx.db.delete("journalPages", page._id);
    return null;
  },
});

// Moves a page to just before `before`, or to the end.
export const movePage = mutation({
  args: { pageId: v.id("journalPages"), before: v.union(v.id("journalPages"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId, true);
    const others = (await pagesOf(ctx, event._id)).filter((p) => p._id !== page._id);
    const at = args.before === null ? others.length : others.findIndex((p) => p._id === args.before);
    if (at < 0) throw notFound();
    await ctx.db.patch("journalPages", page._id, { order: between(others[at - 1]?.order, others[at]?.order) });
    return null;
  },
});

// Locks or unlocks one page, or with no page, the whole journal.
export const setLock = mutation({
  args: { eventId: v.id("events"), pageId: v.optional(v.id("journalPages")), locked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if (args.pageId !== undefined) {
      const { page } = await editablePage(ctx, args.pageId, true);
      if (page.eventId !== event._id) throw notFound();
      await ctx.db.patch("journalPages", page._id, { locked: args.locked || undefined });
      return null;
    }
    const journal = await journalOf(ctx, event._id);
    if (journal === null) await ctx.db.insert("journals", { eventId: event._id, locked: args.locked || undefined });
    else await ctx.db.patch("journals", journal._id, { locked: args.locked || undefined });
    return null;
  },
});

// Pages from a journal file, added at the end. What doesn't belong to this
// experience (a photo from another one, a style that no longer exists) is
// left off rather than refused, so an old file still comes in.
export const importPages = mutation({
  args: { eventId: v.id("events"), pages: v.array(v.object({ paper: v.string(), elements: v.array(vElement) })) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
    const pages = await pagesOf(ctx, event._id);
    if (pages.length + args.pages.length > MAX_JOURNAL_PAGES) {
      throw new ConvexError({ code: "FULL", message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.` });
    }
    let order = pages.at(-1)?.order ?? 0;
    for (const p of args.pages) {
      order += 60_000;
      await ctx.db.insert("journalPages", {
        eventId: event._id,
        order,
        paper: PAPER_SET.has(p.paper) ? p.paper : "cream",
        elements: await encodeElements(ctx, event, p.elements.slice(0, MAX_PAGE_ELEMENTS), true),
      });
    }
    return args.pages.length;
  },
});

// Keeps an uploaded cut-out as a sticker of this experience: on its shelf, and
// visible to everyone who can see the journal.
export const keepSticker = mutation({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.eventId === undefined) throw notFound();
    const { userId, event } = await requireEventAccess(ctx, media.eventId, "owner");
    assertNotArchived(event);
    if (media.uploaderId !== userId || media.status !== "ready" || media.momentId !== undefined || media.mime !== "image/png") {
      invalid("mediaId", "Only a cut-out you just made can become a sticker.");
    }
    await ctx.db.patch("media", media._id, { purpose: "sticker" });
    return null;
  },
});

// The stickers on an experience's shelf, newest first.
export const stickers = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.id("media")),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const ready = await ctx.db
      .query("media")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", event._id).eq("status", "ready"))
      .order("desc")
      .take(2000);
    return ready.filter((m) => m.purpose === "sticker").slice(0, 200).map((m) => m._id);
  },
});

