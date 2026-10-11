import { ConvexError, v } from "convex/values";
import { WorkflowManager, start } from "@convex-dev/workflow";
import { components, internal } from "../_generated/api";
import { action, internalMutation } from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { takeOne } from "../lib/rateLimit";
import { captionMoment, vThumb } from "./scribe";

export const workflow = new WorkflowManager(components.workflow);

// Fills in what the first pass can't: transport per stop and link titles. Both
// go through `apply`, which never overwrites what a person wrote.
export const enrichMoment = workflow.define({
  args: { momentId: v.id("moments") },
  handler: async (step, args): Promise<void> => {
    await step.runAction(internal.ai.decide.decideTransport, args, { retry: true });
    await step.runAction(internal.ai.unfurl.unfurlLinks, args);
  },
});

// AI fill-ins per person per hour: a big import still gets its notes, and a
// runaway client can't run up the AI bill.
const ENRICH_PER_HOUR = 120;
const HOUR_MS = 60 * 60_000;

// Only the moment's author (or the owner) may have it enriched, the same rule
// as editing it. False once they've used this hour's fill-ins.
export const admit = internalMutation({
  args: { momentId: v.id("moments") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(ctx, moment.eventId, "contributor");
    if (role !== "owner" && moment.authorId !== userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only enrich your own moments",
      });
    }
    assertNotArchived(event);
    return await takeOne(ctx, `enrich:${userId}`, ENRICH_PER_HOUR, HOUR_MS);
  },
});

// Called right after a moment is saved. Photos (as 512px JPEGs) go to Scribe
// first, when the caller sends them; then the workflow runs.
export const enrich = action({
  args: {
    momentId: v.id("moments"),
    thumbs: v.optional(v.array(vThumb)),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Over the limit the moment stays as it was saved, just without fill-ins.
    if (!(await ctx.runMutation(internal.ai.enrich.admit, { momentId: args.momentId }))) {
      console.warn("Enrichment skipped: the hourly limit is used up");
      return null;
    }
    if (args.thumbs !== undefined && args.thumbs.length > 0) {
      await captionMoment(ctx, { momentId: args.momentId, thumbs: args.thumbs });
    }
    await start(ctx, internal.ai.enrich.enrichMoment, { momentId: args.momentId });
    return null;
  },
});
