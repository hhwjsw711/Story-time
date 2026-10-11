import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import schema from "./schema";

const vChange = v.object({
  _id: v.id("changes"),
  _creationTime: v.number(),
  ...schema.tables.changes.validator.fields,
  // The display name of the person behind the change (`actorId`), so the log
  // can say who. Absent for the system and for edits with no person behind them.
  actorName: v.optional(v.string()),
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
