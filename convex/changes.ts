import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import schema from "./schema";

// What the Activity badge counts: new moments, new pages, and guestbook notes.
const NOTABLE = new Set(["moment", "page", "guestNote"]);

const vChange = v.object({
  _id: v.id("changes"),
  _creationTime: v.number(),
  ...schema.tables.changes.validator.fields,
  // The display name of the person behind the change (`actorId`), so the log
  // can say who. Absent for the system and for edits with no person behind them.
  actorName: v.optional(v.string()),
});

// How many new moments, pages and guestbook notes the owner has not opened
// Activity for. Zero until something notable is created after the last look.
export const unreadCount = query({
  args: { eventId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return 0;
    const { userId } = await requireEventAccess(ctx, eventId, "owner");
    const read = await ctx.db
      .query("activityReads")
      .withIndex("by_user_and_event", (q) => q.eq("userId", userId).eq("eventId", eventId))
      .unique();
    const since = read?.readAt ?? 0;
    const rows = await ctx.db
      .query("changes")
      .withIndex("by_event_and_at", (q) => q.eq("eventId", eventId).gt("at", since))
      .take(200);
    return rows.filter((row) => row.action === "create" && NOTABLE.has(row.entity)).length;
  },
});

// The owner has looked. Later moments, pages and notes count again.
export const markRead = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "owner");
    const read = await ctx.db
      .query("activityReads")
      .withIndex("by_user_and_event", (q) => q.eq("userId", userId).eq("eventId", args.eventId))
      .unique();
    const readAt = Date.now();
    if (read === null) {
      await ctx.db.insert("activityReads", { userId, eventId: args.eventId, readAt });
    } else {
      await ctx.db.patch("activityReads", read._id, { readAt });
    }
    return null;
  },
});

// Activity feed, newest first. Owner only; a revoked session sees nothing.
export const listForEvent = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vChange),
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const page = await ctx.db
      .query("changes")
      .withIndex("by_event_and_at", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);

    // A page is small, so look each person up once however many rows name them.
    const ids = new Set(page.page.flatMap((c) => (c.actorId === undefined ? [] : [c.actorId])));
    const names = new Map<Id<"users">, string | undefined>(
      await Promise.all([...ids].map(async (id) => [id, (await ctx.db.get("users", id))?.displayName] as const)),
    );
    return {
      ...page,
      page: page.page.map((c) => ({
        ...c,
        actorName: c.actorId === undefined ? undefined : names.get(c.actorId),
      })),
    };
  },
});
