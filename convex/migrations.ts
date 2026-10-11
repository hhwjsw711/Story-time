import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { encryptText } from "./lib/crypto";

const BATCH = 100;

// One-off: encrypts descriptions and quota reasons saved as plain text before
// they were encrypted. It walks each table in batches, scheduling itself until
// both are done, and is safe to run again:
// `npx convex run migrations:encryptPlainText '{}'`
export const encryptPlainText = internalMutation({
  args: {
    table: v.optional(v.union(v.literal("events"), v.literal("quotaRequests"))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const table = args.table ?? "events";
    let encrypted = 0;
    let next: { isDone: boolean; continueCursor: string };

    if (table === "events") {
      const page = await ctx.db.query("events").paginate({ numItems: BATCH, cursor: args.cursor ?? null });
      for (const event of page.page) {
        if (typeof event.description !== "string") continue;
        await ctx.db.patch("events", event._id, {
          description: await encryptText(event._id, event.keyVersion, event.description),
        });
        encrypted++;
      }
      next = page;
    } else {
      const page = await ctx.db.query("quotaRequests").paginate({ numItems: BATCH, cursor: args.cursor ?? null });
      for (const request of page.page) {
        if (typeof request.reason !== "string") continue;
        const event = await ctx.db.get("events", request.eventId);
        // A request for a deleted experience has nothing left to protect.
        if (event === null) continue;
        await ctx.db.patch("quotaRequests", request._id, {
          reason: await encryptText(request.eventId, event.keyVersion, request.reason),
        });
        encrypted++;
      }
      next = page;
    }

    if (!next.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.encryptPlainText, { table, cursor: next.continueCursor });
    } else if (table === "events") {
      await ctx.scheduler.runAfter(0, internal.migrations.encryptPlainText, { table: "quotaRequests" });
    }
    return encrypted;
  },
});
