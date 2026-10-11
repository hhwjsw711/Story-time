import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { appOrigin } from "./lib/appUrl";
import { recordChange } from "./lib/changes";
import { decryptText, encryptText, shareKeyFor } from "./lib/crypto";
import { listForEvent, vMomentView } from "./moments";

// "Anyone with the link can watch". The link carries a random token in its
// fragment, which browsers never send to a server, so it stays out of logs.
// Off until the owner switches it on.

// Same shape as an invite token: 24 random bytes, base64url.
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Checked before any hashing, so junk never reaches the key derivation.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

const linkFor = (token: string) => `${appOrigin()}/s#${token}`;

// The token of the link that is switched on, or null.
async function activeToken(event: Doc<"events">): Promise<string | null> {
  if (event.visibility !== "link" || event.shareToken === undefined) return null;
  return decryptText(event._id, event.shareToken);
}

// Points the experience at a new token. Any link made before stops working.
async function switchOn(ctx: MutationCtx, event: Doc<"events">): Promise<string> {
  const token = newToken();
  await ctx.db.patch("events", event._id, {
    visibility: "link",
    shareKey: await shareKeyFor(token),
    shareToken: await encryptText(event._id, event.keyVersion, token),
  });
  return token;
}

// The experience a link opens, or null. A malformed, unknown and switched-off
// token all read the same, so a caller can't tell which one they had.
async function eventFor(ctx: QueryCtx, token: string): Promise<Doc<"events"> | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const shareKey = await shareKeyFor(token);
  const event = await ctx.db
    .query("events")
    .withIndex("by_shareKey", (q) => q.eq("shareKey", shareKey))
    .unique();
  return event?.visibility === "link" ? event : null;
}

// Shared stories leave out who wrote each moment: the people watching them
// have no account here, and the names are for the people who do.
const vSharedEvent = v.object({
  _id: v.id("events"),
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  momentCount: v.number(),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
});
const vSharedMoment = vMomentView.omit("authorId", "authorName");

// The owner's link, to copy again. Null when none is switched on.
export const link = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    const token = await activeToken(event);
    return token === null ? null : linkFor(token);
  },
});

// Switches the link on, or returns the one already on.
export const enable = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const current = await activeToken(event);
    if (current !== null) return linkFor(current);
    const token = await switchOn(ctx, event);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["visibility"],
      before: { visibility: event.visibility },
      after: { visibility: "link" },
    });
    return linkFor(token);
  },
});

// Switches the link off. Nothing happens if it was already off.
export const disable = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    if (event.visibility !== "link") return null;
    await ctx.db.patch("events", event._id, {
      visibility: "private",
      shareKey: undefined,
      shareToken: undefined,
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["visibility"],
      before: { visibility: "link" },
      after: { visibility: "private" },
    });
    return null;
  },
});

// A new link, for when the old one has got out. The old one stops working at once.
export const rotate = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const token = await switchOn(ctx, event);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["shareLink"],
    });
    return linkFor(token);
  },
});

// Public: the token is the only credential. Null for anything but a live link.
export const get = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({ event: vSharedEvent, moments: v.array(vSharedMoment) }),
  ),
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    const moments = await listForEvent(ctx, event);
    return {
      event: {
        _id: event._id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        momentCount: event.momentCount,
        status: event.status,
      },
      // Field by field, so a field added to moments later isn't shared by accident.
      moments: moments.map((m) => ({
        _id: m._id,
        startsAt: m.startsAt,
        place: m.place,
        geo: m.geo,
        blocks: m.blocks,
        transport: m.transport,
        stops: m.stops,
        labels: m.labels,
      })),
    };
  },
});

// Public: a picture's bytes for a share link, the same shape the signed-in
// route gets. Only pictures on a moment of this experience qualify.
export const mediaForShare = query({
  args: { token: v.string(), mediaId: v.id("media") },
  returns: v.union(
    v.null(),
    v.object({
      r2Key: v.string(),
      mime: v.string(),
      keyVersion: v.number(),
      keyScope: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    const media = await ctx.db.get("media", args.mediaId);
    // Not while still being uploaded, not after it's taken off a moment, and
    // never another experience's.
    if (
      media === null ||
      media.status !== "ready" ||
      media.eventId !== event._id ||
      media.momentId === undefined
    ) {
      return null;
    }
    return {
      r2Key: media.r2Key,
      mime: media.mime,
      keyVersion: media.keyVersion,
      keyScope: event._id,
    };
  },
});
