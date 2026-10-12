import { type JournalElement, PAGE } from "../../../convex/lib/journal";

// Getting a journal out as paper (an A4 PDF, a page as a picture) and as a
// file it can come back from.

// Waits for a drawn page to have its photos and maps: placeholders still
// pulsing mean a photo is on its way. Gives up after a while and takes it as is.
async function settled(node: HTMLElement, hasMap: boolean) {
  const until = Date.now() + 10_000;
  while (Date.now() < until && node.querySelector(".animate-pulse")) await new Promise((r) => setTimeout(r, 150));
  await Promise.all([...node.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  await document.fonts.ready;
  // Map tiles come in after the map itself.
  if (hasMap) await new Promise((r) => setTimeout(r, 1800));
}

const options = {
  width: PAGE.w,
  height: PAGE.h,
  scale: 2,
  // The page is drawn scaled on screen; the picture is at full size.
  style: { transform: "none" },
  // The play buttons on maps are for the screen, not the paper.
  filter: (n: Node) => !(n instanceof HTMLElement && n.dataset.exportHide !== undefined),
};

// A drawn page and what it needs: whether it has a map (to wait for tiles),
// and its paper's colour (the picture starts from it, under the paper's grain).
export type Drawn = { node: HTMLElement; hasMap: boolean; paper: string };

// Waits until React has committed the page being printed, then two frames so
// the picture is of that page and not the one before it.
export function waitForPage(root: HTMLDivElement | null, pageId: string): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let frames = 0;
    const tick = () => {
      const node = root?.querySelector<HTMLElement>("[data-journal-page]");
      if (node?.dataset.pageId === pageId) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(node)));
        return;
      }
      if (++frames > 60) reject(new Error("The page couldn't be drawn."));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function pagePng({ node, hasMap, paper }: Drawn): Promise<string> {
  const { domToPng } = await import("modern-screenshot");
  await settled(node, hasMap);
  return domToPng(node, { ...options, backgroundColor: paper });
}

// Every page, one A4 sheet each, in order. `pages` draws them one at a time
// at full size and hands back the drawn node.
export async function journalPdf(
  count: number,
  draw: (index: number) => Promise<Drawn>,
  onProgress: (done: number) => void,
): Promise<Blob> {
  const [{ jsPDF }, { domToJpeg }] = await Promise.all([import("jspdf"), import("modern-screenshot")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  for (let i = 0; i < count; i++) {
    const { node, hasMap, paper } = await draw(i);
    await settled(node, hasMap);
    const jpeg = await domToJpeg(node, { ...options, backgroundColor: paper, quality: 0.9 });
    if (i > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(jpeg, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    onProgress(i + 1);
  }
  return pdf.output("blob");
}

export function download(href: string | Blob, name: string) {
  const url = typeof href === "string" ? href : URL.createObjectURL(href);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (typeof href !== "string") setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const fileName = (title: string) => title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "journal";

// The sitting (this page, this day) is the ordinary print. Past a few dozen
// pages, the whole journal is the unusual one, and the menu says so.
export function wholeJournalPdfLabel(pages: number): string {
  const count = `${pages} ${pages === 1 ? "page" : "pages"}`;
  return pages > 36 ? `The whole journal as a PDF (${count}, a long one)` : `The whole journal as a PDF (${count})`;
}

// ---- The journal as a file ----------------------------------------------------------------

const KIND = "story-time-journal";

type JournalFile = { kind: typeof KIND; version: 1; title: string; pages: Array<{ paper: string; elements: JournalElement[] }> };

export function journalFile(title: string, pages: Array<{ paper: string; elements: JournalElement[] }>): Blob {
  const file: JournalFile = { kind: KIND, version: 1, title, pages: pages.map(({ paper, elements }) => ({ paper, elements })) };
  return new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Reads a journal file back. Only its shape is checked here; the server
// checks every page as it adds it.
export async function readJournalFile(file: File): Promise<Array<{ paper: string; elements: JournalElement[] }>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That isn't a journal file.");
  }
  if (!isObject(parsed) || parsed.kind !== KIND || !Array.isArray(parsed.pages)) throw new Error("That isn't a journal file.");
  return parsed.pages.flatMap((p): Array<{ paper: string; elements: JournalElement[] }> => {
    if (!isObject(p) || typeof p.paper !== "string" || !Array.isArray(p.elements)) return [];
    const elements = p.elements.filter(
      (e): e is JournalElement =>
        isObject(e) &&
        typeof e.id === "string" &&
        typeof e.kind === "string" &&
        ["x", "y", "w", "h", "rotation", "z"].every((k) => typeof e[k] === "number"),
    );
    return [{ paper: p.paper, elements }];
  });
}
