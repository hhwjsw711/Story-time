import { ConvexError, v } from "convex/values";
import { WorkflowManager, start } from "@convex-dev/workflow";
import { components, internal } from "../_generated/api";
import { action, internalQuery } from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
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

// Only the moment's author (or the owner) may have it enriched, the same rule
// as editing it.
export const authorize = internalQuery({
  args: { momentId: v.id("moments") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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
    return null;
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
    await ctx.runQuery(internal.ai.enrich.authorize, { momentId: args.momentId });
    if (args.thumbs !== undefined && args.thumbs.length > 0) {
      await captionMoment(ctx, { momentId: args.momentId, thumbs: args.thumbs });
    }
    await start(ctx, internal.ai.enrich.enrichMoment, { momentId: args.momentId });
    return null;
  },
});
