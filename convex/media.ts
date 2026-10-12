import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  assertNotArchived,
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  sharesExperience,
} from "./lib/access";
import { recordChange } from "./lib/changes";
import {
  AVATAR_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_AVATAR_BYTES,
  MAX_LIVE_UPLOAD_BYTES,
  MAX_MEDIA_PER_EVENT,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_TYPES,
} from "./lib/limits";

// Live rows read per status when checking one person's upload budget. Past
// this the total can't be known, so the upload is refused instead of
// under-counted (a flood of tiny files would otherwise hide the rest).
const BUDGET_SCAN = 5000;

// One person's live bytes across every experience, so one account can't fill
// the bucket. Profile images count too. Deleted uploads don't, so removing
// frees room.
async function assertUploadBudget(ctx: MutationCtx, userId: Id<"users">, size: number) {
  let liveBytes = 0;
  let uncounted = false;
  for (const status of ["ready", "reserved"] as const) {
    const rows = await ctx.db
      .query("media")
      .withIndex("by_uploader_and_status", (q) => q.eq("uploaderId", userId).eq("status", status))
      .take(BUDGET_SCAN + 1);
    if (rows.length > BUDGET_SCAN) uncounted = true;
    for (const row of rows) liveBytes += row.size;
  }
  if (uncounted || liveBytes + size > MAX_LIVE_UPLOAD_BYTES) {
    throw new ConvexError({
      code: "UPLOAD_BUDGET",
      message:
        "You've reached your upload limit across all experiences. Delete some photos or videos to make room.",
    });
  }
}

// Step 1 of an upload: the server route calls this before it streams bytes
// to R2, so size, type and per-event caps are enforced here.
export const reserveUpload = mutation({
  args: { eventId: v.id("events"), size: v.number(), mime: v.string() },
  returns: v.object({
    mediaId: v.id("media"),
    r2Key: v.string(),
    keyVersion: v.number(),
    keyScope: v.string(),
  }),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "contributor",
    );
    assertNotArchived(event);
    if (!Number.isInteger(args.size) || args.size < 1) {
      throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    }
    const isVideo = VIDEO_MIME_TYPES.includes(args.mime);
    if (!isVideo && !IMAGE_MIME_TYPES.includes(args.mime)) {
      throw new ConvexError({
        code: "INVALID",
        field: "mime",
        message: "Unsupported file type",
      });
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
    if (args.size > maxBytes) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: isVideo ? "Videos can be at most 50 MB" : "Photos can be at most 5 MB",
        maxBytes,
      });
    }
    // Stops one contributor reserving unlimited objects. Deleted uploads
    // don't count, so removing photos frees room.
    const cap = MAX_MEDIA_PER_EVENT;
    let live = 0;
    for (const status of ["reserved", "ready"] as const) {
      const rows = await ctx.db
        .query("media")
        .withIndex("by_event_and_status", (q) =>
          q.eq("eventId", args.eventId).eq("status", status),
        )
        .take(cap);
      live += rows.length;
    }
    if (live >= cap) {
      throw new ConvexError({
        code: "MEDIA_LIMIT",
        message: "This experience has reached its upload limit",
      });
    }
    await assertUploadBudget(ctx, userId, args.size);

    const r2Key = `events/${args.eventId}/${crypto.randomUUID()}`;
    const mediaId = await ctx.db.insert("media", {
      eventId: args.eventId,
      uploaderId: userId,
      r2Key,
      size: args.size,
      mime: args.mime,
      keyVersion: event.keyVersion,
      status: "reserved",
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "media",
      entityId: mediaId,
      actorId: userId,
      action: "create",
      fields: ["size", "mime", "status"],
      after: { size: args.size, mime: args.mime, status: "reserved" },
    });
    return { mediaId, r2Key, keyVersion: event.keyVersion, keyScope: args.eventId };
  },
});

// Step 3: the route confirms once R2 holds the object.
export const confirmUpload = mutation({
  args: { mediaId: v.id("media"), sha256: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    // A deleted upload stays deleted: only a reserved row can become ready.
    if (
      media === null ||
      media.uploaderId !== userId ||
      media.status === "deleted"
    ) {
      throw new Error("Upload not found");
    }
    if (media.purpose === "avatar") {
      if (media.status === "reserved") {
        await ctx.db.patch("media", args.mediaId, {
          status: "ready",
          sha256: args.sha256,
        });
      }
      return null;
    }
    if (media.eventId === undefined) throw new Error("Upload not found");
    // Access can be revoked between reserve and confirm.
    const { event } = await requireEventAccess(ctx, media.eventId, "contributor");
    assertNotArchived(event);
    if (media.status === "ready") return null;
    await ctx.db.patch("media", args.mediaId, {
      status: "ready",
      sha256: args.sha256,
    });
    await recordChange(ctx, {
      eventId: media.eventId,
      entity: "media",
      entityId: args.mediaId,
      actorId: userId,
      action: "update",
      fields: ["status"],
      before: { status: "reserved" },
      after: { status: "ready" },
    });
    return null;
  },
});

// Used by the download route. Null for anyone without an active grant.
export const getForDownload = query({
  args: { mediaId: v.id("media") },
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
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.status !== "ready") return null;

    if (media.purpose === "avatar") {
      // A profile image is visible to its owner and to people who share an
      // experience with them, and to nobody else.
      const viewer = await getUserId(ctx);
      if (viewer === null) return null;
      if (
        viewer !== media.uploaderId &&
        !(await sharesExperience(ctx, viewer, media.uploaderId))
      ) {
        return null;
      }
      return {
        r2Key: media.r2Key,
        mime: media.mime,
        keyVersion: media.keyVersion,
        keyScope: `avatar:${media.uploaderId}`,
      };
    }

    if (media.eventId === undefined) return null;
    const access = await getEventAccess(ctx, media.eventId);
    if (access === null) return null;
    // Photos not yet attached to a moment are visible to their uploader only.
    if (media.momentId === undefined && media.uploaderId !== access.userId) {
      return null;
    }
    return {
      r2Key: media.r2Key,
      mime: media.mime,
      keyVersion: media.keyVersion,
      keyScope: media.eventId,
    };
  },
});

// Profile images: not tied to an experience, smaller cap, own key scope.
export const reserveAvatarUpload = mutation({
  args: { size: v.number(), mime: v.string() },
  returns: v.object({
    mediaId: v.id("media"),
    r2Key: v.string(),
    keyVersion: v.number(),
    keyScope: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(args.size) || args.size < 1) {
      throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    }
    if (args.size > MAX_AVATAR_BYTES) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: "Profile images can be at most 2 MB",
        maxBytes: MAX_AVATAR_BYTES,
      });
    }
    if (!AVATAR_MIME_TYPES.includes(args.mime)) {
      throw new ConvexError({
        code: "INVALID",
        field: "mime",
        message: "Use a JPEG, PNG, WebP or AVIF image",
      });
    }
    await assertUploadBudget(ctx, userId, args.size);
    const r2Key = `avatars/${userId}/${crypto.randomUUID()}`;
    const mediaId = await ctx.db.insert("media", {
      purpose: "avatar",
      uploaderId: userId,
      r2Key,
      size: args.size,
      mime: args.mime,
      keyVersion: 1,
      status: "reserved",
    });
    return { mediaId, r2Key, keyVersion: 1, keyScope: `avatar:${userId}` };
  },
});

// Returns the image it replaced so the caller can delete that object from R2.
export const setAvatar = mutation({
  args: { mediaId: v.id("media") },
  returns: v.union(v.null(), v.id("media")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (
      media === null ||
      media.purpose !== "avatar" ||
      media.uploaderId !== userId ||
      media.status !== "ready"
    ) {
      throw new ConvexError({
        code: "INVALID",
        message: "That image isn't available",
      });
    }
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("Not signed in");
    const previous = user.imageMediaId ?? null;
    await ctx.db.patch("users", userId, { imageMediaId: args.mediaId });
    return previous === args.mediaId ? null : previous;
  },
});

export const clearAvatar = mutation({
  args: {},
  returns: v.union(v.null(), v.id("media")),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("Not signed in");
    const previous = user.imageMediaId ?? null;
    if (previous !== null) {
      await ctx.db.patch("users", userId, { imageMediaId: undefined });
    }
    return previous;
  },
});

// Who may permanently delete a stored object. Profile images: the owner,
// once it's no longer their current image. Experience photos: once no
// moment uses them, the experience owner, or the uploader (or the detacher,
// which is only ever the uploader; see moments.ts) while they still contribute.
async function deletableBy(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  media: Doc<"media">,
): Promise<boolean> {
  if (media.status === "deleted") return false;
  if (media.purpose === "avatar") {
    if (media.uploaderId !== userId) return false;
    const user = await ctx.db.get("users", userId);
    return user?.imageMediaId !== media._id;
  }
  if (media.momentId !== undefined || media.eventId === undefined) return false;
  // Checked now, not when the photo was added: someone whose access was
  // revoked, or who is only a viewer now, can no longer delete.
  const access = await getEventAccess(ctx, media.eventId);
  if (access === null || access.role === "viewer") return false;
  if (access.role === "owner") return true;
  return media.uploaderId === userId || media.detachedBy === userId;
}

// For the delete route.
export const getForDelete = query({
  args: { mediaId: v.id("media") },
  returns: v.union(v.null(), v.object({ r2Key: v.string() })),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || !(await deletableBy(ctx, userId, media))) return null;
    return { r2Key: media.r2Key };
  },
});

// Called by the delete route once the R2 object is gone.
export const markDeleted = mutation({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || !(await deletableBy(ctx, userId, media))) {
      throw new Error("Not found");
    }
    await ctx.db.patch("media", args.mediaId, { status: "deleted" });
    return null;
  },
});

// An upload still "reserved" an hour later was abandoned: the tab closed before
// its bytes or its confirm arrived. It still counts toward the experience's cap,
// so the sweep marks it deleted. Runs hourly (see crons.ts).
const RESERVATION_TTL_MS = 60 * 60_000;
const SWEEP_BATCH = 100;

export const sweepReservedUploads = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const stale = await ctx.db
      .query("media")
      .withIndex("by_status", (q) =>
        q.eq("status", "reserved").lt("_creationTime", Date.now() - RESERVATION_TTL_MS),
      )
      .take(SWEEP_BATCH);
    for (const media of stale) {
      await ctx.db.patch("media", media._id, { status: "deleted" });
    }
    // A full batch may leave more behind: continue in a fresh transaction.
    if (stale.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.media.sweepReservedUploads, {});
    }
    return stale.length;
  },
});

// Under Convex's per-call document read limit, with room for the row reads.
const MAX_KEYS = 12_000;

// R2 keys to delete before an experience is removed. Owner only. Deleted rows
// are included: their objects may not be gone yet, and R2 deletes are
// idempotent. Each status is streamed, so many deleted rows can't hide live
// ones, and the total is capped to stay inside Convex's per-call read limits.
export const listKeysForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const keys: string[] = [];
    for (const status of ["ready", "reserved", "deleted"] as const) {
      const rows = ctx.db
        .query("media")
        .withIndex("by_event_and_status", (q) =>
          q.eq("eventId", args.eventId).eq("status", status),
        );
      for await (const row of rows) {
        keys.push(row.r2Key);
        if (keys.length >= MAX_KEYS) return keys;
      }
    }
    return keys;
  },
});
