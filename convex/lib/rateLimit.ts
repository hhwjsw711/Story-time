import type { MutationCtx } from "../_generated/server";

// Counts one use of `key`: at most `limit` in each fixed window of `windowMs`.
// False when the window is full; that attempt isn't counted.
export async function takeOne(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row === null) {
    await ctx.db.insert("limits", { key, windowStart: now, count: 1 });
    return true;
  }
  if (now - row.windowStart >= windowMs) {
    await ctx.db.patch("limits", row._id, { windowStart: now, count: 1 });
    return true;
  }
  if (row.count >= limit) return false;
  await ctx.db.patch("limits", row._id, { count: row.count + 1 });
  return true;
}
