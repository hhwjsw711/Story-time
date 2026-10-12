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
    const read = await readPublic(raw, HEAD_BYTES);
    return read === undefined ? undefined : titleFromHtml(read.html);
  } catch {
    return undefined;
  }
}

const MAX_REDIRECTS = 5;

// Where a redirect would send the next fetch, or nothing if that address is
// not one this server should open.
export function publicRedirect(base: string, location: string): string | undefined {
  try {
    const next = new URL(location, base);
    return isPublicWebUrl(next) ? next.href : undefined;
  } catch {
    return undefined;
  }
}

function isLiteralAddress(host: string): boolean {
  const name = host.endsWith(".") ? host.slice(0, -1) : host;
  if (name.startsWith("[") || name.includes(":")) return true;
  if (/^\d+$/.test(name)) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

// Web addresses only. Literal IPs, localhost, and link-local or metadata names
// are refused. A hostname that merely *resolves* to a private address is not
// checked here: this file also holds queries, so it cannot use a DNS lookup.
export function isPublicWebUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  if (host === "" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isLiteralAddress(host)) return false;
  return true;
}

// Fetches a public page, following redirects by hand and checking every hop.
async function readPublic(raw: string, limit: number): Promise<{ html: string; url: string } | undefined> {
  let current = new URL(raw);
  if (!isPublicWebUrl(current)) return undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
    const landed = response.url ? new URL(response.url) : current;
    if (!isPublicWebUrl(landed)) return undefined;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return undefined;
      const next = publicRedirect(landed.href, location);
      if (next === undefined) return undefined;
      current = new URL(next);
      continue;
    }
    if (!response.ok || response.body === null) return undefined;
    return { html: await readHead(response.body, limit), url: landed.href };
  }
  return undefined;
}

// Reads up to `limit` bytes, then stops the download.
export async function readHead(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
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

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export type LinkPreview = { url: string; title?: string; description?: string; image?: string; site?: string };

// What a page says about itself for a preview: its Open Graph (or Twitter)
// title, description, picture and site, falling back to <title> and the
// meta description. A picture must be a public https address.
export function previewFromHtml(html: string, url: string): LinkPreview {
  const meta = (names: string[]) => {
    for (const name of names) {
      const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i").exec(html)?.[0];
      const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
      if (content?.trim()) return decodeEntities(content).replace(/\s+/g, " ").trim();
    }
    return undefined;
  };
  const clip = (text: string | undefined, n: number) => (text === undefined ? undefined : text.length > n ? `${text.slice(0, n - 1)}…` : text);
  let image = meta(["og:image", "og:image:url", "twitter:image"]);
  try {
    const resolved = image === undefined ? undefined : new URL(image, url);
    image = resolved && resolved.protocol === "https:" && isPublicWebUrl(resolved) ? resolved.href : undefined;
  } catch {
    image = undefined;
  }
  return {
    url,
    title: clip(meta(["og:title", "twitter:title"]) ?? titleFromHtml(html), 160),
    description: clip(meta(["og:description", "twitter:description", "description"]), 280),
    image: image && image.length <= 600 ? image : undefined,
    site: clip(meta(["og:site_name"]) ?? new URL(url).hostname.replace(/^www\./, ""), 60),
  };
}

// Fetches a page's first 256 KB and reads its preview. Nothing on failure.
export async function previewOf(raw: string): Promise<LinkPreview | undefined> {
  try {
    const read = await readPublic(raw, 256 * 1024);
    return read === undefined ? undefined : previewFromHtml(read.html, read.url);
  } catch {
    return undefined;
  }
}
