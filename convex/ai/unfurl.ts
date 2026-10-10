import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { decryptText } from "../lib/crypto";

const vLinkRef = v.object({
  stopIndex: v.number(),
  blockIndex: v.number(),
  url: v.string(),
});
type LinkRef = Infer<typeof vLinkRef>;

// A moment's links are capped, and each fetch gets 5 seconds and 64 KB.
const MAX_LINKS = 10;
const HEAD_BYTES = 64 * 1024;
const TITLE_CHARS = 200;
const TIMEOUT_MS = 5000;

// Links with no title yet, with their URLs decrypted for the fetch.
export const linksToUnfurl = internalQuery({
  args: { momentId: v.id("moments") },
  returns: v.array(vLinkRef),
  handler: async (ctx, args): Promise<LinkRef[]> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) return [];
    const event = await ctx.db.get("events", moment.eventId);
    if (event === null) return [];

    const refs: LinkRef[] = [];
    const stops = [moment.blocks, ...(moment.stops ?? []).map((s) => s.blocks)];
    for (const [stopIndex, blocks] of stops.entries()) {
      for (const [blockIndex, block] of blocks.entries()) {
        if (block.type === "link" && block.title === undefined) {
          const url = await decryptText(event._id, block.url);
          refs.push({ stopIndex, blockIndex, url });
        }
      }
    }
    return refs;
  },
});

// Takes a page's <title>, from its first 64 KB, for each untitled link. A link
// that fails for any reason just keeps no title.
export const unfurlLinks = internalAction({
  args: { momentId: v.id("moments") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const links: LinkRef[] = await ctx.runQuery(internal.ai.unfurl.linksToUnfurl, {
      momentId: args.momentId,
    });
    // Fetched in parallel, and capped, so one moment can't hold up the workflow.
    const found = await Promise.all(
      links.slice(0, MAX_LINKS).map(async (link) => {
        const title = await titleOf(link.url);
        return title === undefined ? null : { stopIndex: link.stopIndex, blockIndex: link.blockIndex, title };
      }),
    );
    const linkTitles = found.filter(
      (t): t is { stopIndex: number; blockIndex: number; title: string } => t !== null,
    );
    if (linkTitles.length > 0) {
      await ctx.runMutation(internal.ai.apply.apply, { momentId: args.momentId, linkTitles });
    }
    return null;
  },
});

// The page's <title>: entities decoded, whitespace collapsed, at most 200 characters.
export function titleFromHtml(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = decodeEntities(match?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_CHARS);
  return title === "" ? undefined : title;
}

async function titleOf(raw: string): Promise<string | undefined> {
  try {
    const url = new URL(raw);
    if (!isPublicWebUrl(url)) return undefined;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!response.ok || response.body === null) return undefined;
    return titleFromHtml(await readHead(response.body, HEAD_BYTES));
  } catch {
    return undefined;
  }
}

// Web addresses only, and not this machine or a bare IP: nothing the server
// shouldn't be fetching for someone.
function isPublicWebUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  return host !== "localhost" && !host.endsWith(".localhost") && !host.startsWith("[") && !/^[\d.]+$/.test(host);
}

// Reads up to `limit` bytes, then stops the download.
async function readHead(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = body.getReader();
  const buffer = new Uint8Array(limit);
  let filled = 0;
  while (filled < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const n = Math.min(value.byteLength, limit - filled);
    buffer.set(value.subarray(0, n), filled);
    filled += n;
  }
  await reader.cancel();
  return new TextDecoder().decode(buffer.subarray(0, filled));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}
