import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getEventAccessFor, getUserId, requireEventAccess, requireUserId } from "./lib/access";
import { agentLabel } from "./lib/actors";
import { agentKeyFor } from "./lib/crypto";

// A connection's token: "stk_" and 32 random bytes in base64url. Only its keyed
// hash is stored, so the token is shown once, when it is made.
const TOKEN_SHAPE = /^stk_[A-Za-z0-9_-]{43}$/;
// Live (not revoked) connections one person may hold at once.
const MAX_LIVE_TOKENS = 10;
// Past this many rows we stop counting. Revoked rows are kept, so a person's
// history can grow; a limit we can't fully count is treated as reached.
const TOKEN_SCAN_CAP = 500;
const LIST_LIMIT = 50;
// Requests per connection in one fixed window.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
// The "last used" time is written at most this often.
const USED_EVERY_MS = 60_000;

const vConnection = v.object({
  _id: v.id("agentTokens"),
  name: v.string(),
  prefix: v.string(),
  eventId: v.optional(v.id("events")),
  // The experience's title, when the person can still see it.
  eventTitle: v.optional(v.string()),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return "stk_" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// agentLabel cuts at 40 UTF-16 units, which can split an emoji in two. Drop the
// lone half, since stored text must be valid Unicode.
function nameOf(raw: string): string {
  return agentLabel(raw).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
}

function tokenLimitReached(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "TOKEN_LIMIT",
    message: `You can have ${MAX_LIVE_TOKENS} assistants connected at once. Disconnect one first.`,
  });
}

// Makes a new connection. The token is returned here and nowhere else.
export const create = mutation({
  args: { name: v.string(), eventId: v.optional(v.id("events")) },
  returns: v.object({ id: v.id("agentTokens"), token: v.string(), prefix: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = nameOf(args.name);
    if (name === "") {
      throw new ConvexError({
        code: "INVALID",
        field: "name",
        message: "Give the assistant a name, like Claude Desktop.",
      });
    }
    // An assistant limited to one experience needs a say in it.
    if (args.eventId !== undefined) {
      await requireEventAccess(ctx, args.eventId, "contributor");
    }

    const rows = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(TOKEN_SCAN_CAP);
    const live = rows.filter((row) => row.revokedAt === undefined).length;
    if (live >= MAX_LIVE_TOKENS || rows.length === TOKEN_SCAN_CAP) throw tokenLimitReached();

    const token = newToken();
    const prefix = token.slice(0, 8);
    const id = await ctx.db.insert("agentTokens", {
      userId,
      name,
      tokenKey: await agentKeyFor(token),
      prefix,
      eventId: args.eventId,
      createdAt: Date.now(),
    });
    return { id, token, prefix };
  },
});

// The signed-in person's connections, newest first. Never the token or its hash.
export const list = query({
  args: {},
  returns: v.array(vConnection),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(LIST_LIMIT);
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        name: row.name,
        prefix: row.prefix,
        eventId: row.eventId,
        // Only while the person still has a say in that experience.
        eventTitle:
          row.eventId === undefined
            ? undefined
            : (await getEventAccessFor(ctx, userId, row.eventId))?.event.title,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
      })),
    );
  },
});

// Disconnects one of the person's own connections. Doing it twice is harmless.
export const revoke = mutation({
  args: { id: v.id("agentTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("agentTokens", args.id);
    // Someone else's connection reads as missing, so ids can't be probed.
    if (row === null || row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That connection no longer exists." });
    }
    if (row.revokedAt === undefined) {
      await ctx.db.patch("agentTokens", row._id, { revokedAt: Date.now() });
    }
    return null;
  },
});

function unauthorized(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "UNAUTHORIZED",
    message: "This assistant connection is missing or has been disconnected.",
  });
}

// The window a connection's requests are counted in, starting afresh when the
// last one has run out.
function windowOf(
  row: { windowStart?: number; windowCount?: number },
  now: number,
): { start: number; used: number } {
  if (row.windowStart !== undefined && now - row.windowStart < RATE_WINDOW_MS) {
    return { start: row.windowStart, used: row.windowCount ?? 0 };
  }
  return { start: now, used: 0 };
}

// Who a token acts for. A missing, unknown and revoked token all read the same.
// Every call counts toward the rate limit; the count and any write it makes
// commit together, and a call that is refused writes nothing.
export async function authenticateToken(
  ctx: MutationCtx,
  token: string,
): Promise<{
  tokenId: Id<"agentTokens">;
  userId: Id<"users">;
  name: string;
  eventId: Id<"events"> | undefined;
}> {
  // Checked before hashing, so junk never reaches the key derivation.
  if (!TOKEN_SHAPE.test(token)) throw unauthorized();
  const tokenKey = await agentKeyFor(token);
  const row = await ctx.db
    .query("agentTokens")
    .withIndex("by_tokenKey", (q) => q.eq("tokenKey", tokenKey))
    .unique();
  if (row === null || row.revokedAt !== undefined) throw unauthorized();

  const now = Date.now();
  const window = windowOf(row, now);
  if (window.used >= RATE_LIMIT) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: "Slow down: an agent connection may make 60 requests a minute.",
    });
  }
  const touch = row.lastUsedAt === undefined || now - row.lastUsedAt >= USED_EVERY_MS;
  await ctx.db.patch("agentTokens", row._id, {
    windowStart: window.start,
    windowCount: window.used + 1,
    ...(touch ? { lastUsedAt: now } : {}),
  });
  return { tokenId: row._id, userId: row.userId, name: row.name, eventId: row.eventId };
}
