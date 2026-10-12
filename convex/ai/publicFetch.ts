"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { readPublicPage, type WebFetch } from "../lib/publicWeb";

// Opens a public page after looking the hostname up. Queries cannot do that
// lookup, so the preview and the link titles both come through here. A name
// that points anywhere private, or that cannot be looked up, returns nothing.
export const fetchPage = internalAction({
  args: { url: v.string(), limit: v.number() },
  returns: v.union(v.null(), v.object({ html: v.string(), url: v.string() })),
  handler: async (ctx, args) => {
    void ctx;
    const { lookup } = await import("node:dns/promises");
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 256 * 1024);
    return await readPublicPage(args.url, limit, {
      resolve: async (host) => {
        const records = await lookup(host, { all: true, verbatim: true });
        return records.map((record) => record.address);
      },
      fetch: fetch as WebFetch,
    });
  },
});
