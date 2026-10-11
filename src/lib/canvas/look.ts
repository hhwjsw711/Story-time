// How things on the canvas look: a scrapbook of torn paper, taped prints and
// ransom-note letters. Everything here is a name and a few colours, so a
// piece stores only the name (`look`) and the page draws the rest.

// ---- Random that stays put ---------------------------------------------------

// A repeatable stream of numbers in [0, 1) from any string. A torn edge or a
// letter's tilt comes from the piece's id, so it looks the same every time it
// is drawn, on every screen, in a shared link too.
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Frames: a page and its theme --------------------------------------------

export type FrameLook = {
  id: string;
  name: string;
  // The page, the ink on it, and the one loud colour (a block, a dot).
  page: string;
  ink: string;
  accent: string;
  // What the viewer's desk turns to while the flow is inside this frame.
  surround: string;
};

// From the reference collages: the peach book cover, the cream gallery page,
// the slate with the pink blob, the sky ledger, kraft, and the plum plate.
export const FRAME_LOOKS: FrameLook[] = [
  { id: "peach", name: "Peach book", page: "#f6d3ac", ink: "#201a16", accent: "#e8987a", surround: "#e9c6a0" },
  { id: "cream", name: "Cream gallery", page: "#f7f1e2", ink: "#1c1917", accent: "#e8805a", surround: "#e6dcc6" },
  { id: "slate", name: "Slate blue", page: "#5b769a", ink: "#f6f0e1", accent: "#f0a9b9", surround: "#47607f" },
  { id: "sky", name: "Sky ledger", page: "#cfe4f3", ink: "#1b2430", accent: "#e5584b", surround: "#b5d1e6" },
  { id: "kraft", name: "Kraft paper", page: "#cba978", ink: "#2a1e12", accent: "#2f4a3a", surround: "#b99660" },
  { id: "plum", name: "Plum plate", page: "#6b5b87", ink: "#f4eee3", accent: "#f2c14e", surround: "#54466e" },
];

export const frameLook = (id: string | undefined): FrameLook => FRAME_LOOKS.find((l) => l.id === id) ?? FRAME_LOOKS[1]!;

// How big a new frame is.
export const FRAME_SIZES = [
  { id: "poster", name: "Poster", w: 1200, h: 800 },
  { id: "square", name: "Square", w: 900, h: 900 },
  { id: "strip", name: "Strip", w: 1400, h: 420 },
  { id: "phone", name: "Phone", w: 560, h: 1000 },
] as const;

// ---- The desk under the frames -----------------------------------------------

export const DESK = { color: "#d9d1c2", dot: "rgba(60, 48, 30, 0.22)", gap: 48 } as const;

// ---- Paper scraps -------------------------------------------------------------

export type PaperLook = { id: string; name: string; page: string; ink: string };

export const PAPERS: PaperLook[] = [
  { id: "paper", name: "Paper", page: "#fbf7ec", ink: "#231d17" },
  { id: "kraft", name: "Kraft", page: "#d9be92", ink: "#2a1e12" },
  { id: "news", name: "Newsprint", page: "#e9e4d6", ink: "#1c1b19" },
  { id: "sky", name: "Sky", page: "#a9c7e4", ink: "#14202c" },
  { id: "rose", name: "Rose", page: "#f0b9c6", ink: "#2c1419" },
  { id: "sun", name: "Sun", page: "#f4de8a", ink: "#2a2208" },
];

export const paperLook = (id: string | undefined): PaperLook => PAPERS.find((p) => p.id === id) ?? PAPERS[0]!;

// ---- Prints --------------------------------------------------------------------

export const PRINTS = [
  { id: "print", name: "Print" },
  { id: "torn", name: "Torn" },
  { id: "cutout", name: "Cutout" },
  { id: "plain", name: "Plain" },
] as const;
export type PrintId = (typeof PRINTS)[number]["id"];
export const printLook = (id: string | undefined): PrintId => PRINTS.find((p) => p.id === id)?.id ?? "print";

// ---- Tape ----------------------------------------------------------------------

export const TAPES = [
  { id: "tape", name: "Masking", color: "rgba(236, 222, 176, 0.78)", stripe: false },
  { id: "washi-red", name: "Red washi", color: "rgba(214, 84, 70, 0.72)", stripe: true },
  { id: "washi-blue", name: "Blue washi", color: "rgba(86, 134, 188, 0.72)", stripe: true },
  { id: "washi-yellow", name: "Yellow washi", color: "rgba(240, 196, 72, 0.78)", stripe: true },
] as const;
export const tapeLook = (id: string | undefined) => TAPES.find((t) => t.id === id) ?? TAPES[0];

// ---- Torn edges ---------------------------------------------------------------

// A CSS polygon for a rectangle with an uneven, torn edge on the sides in
// `edges`, as percentages so it fits any size. `roughness` is how far a point
// strays, in percent of the side.
export function tornPolygon(
  seed: string,
  edges: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean } = { top: true, right: true, bottom: true, left: true },
  roughness = 1.8,
  steps = 14,
): string {
  const rnd = seeded(seed);
  const wobble = (on: boolean | undefined) => (on ? rnd() * roughness : 0);
  const pts: string[] = [];
  const pct = (n: number) => `${n.toFixed(2)}%`;
  // Clockwise from the top-left corner.
  for (let i = 0; i <= steps; i++) pts.push(`${pct((i / steps) * 100)} ${pct(wobble(edges.top))}`);
  for (let i = 1; i <= steps; i++) pts.push(`${pct(100 - wobble(edges.right))} ${pct((i / steps) * 100)}`);
  for (let i = steps - 1; i >= 0; i--) pts.push(`${pct((i / steps) * 100)} ${pct(100 - wobble(edges.bottom))}`);
  for (let i = steps - 1; i >= 1; i--) pts.push(`${pct(wobble(edges.left))} ${pct((i / steps) * 100)}`);
  return `polygon(${pts.join(", ")})`;
}

// The jagged ends of a strip of tape.
export const TAPE_ENDS = "polygon(0 0, 100% 0, 98% 20%, 100% 40%, 98% 60%, 100% 80%, 98% 100%, 0 100%, 2% 80%, 0 60%, 2% 40%, 0 20%)";

// ---- Ransom-note letters ------------------------------------------------------

export type LetterLook = { id: string; bg: string; fg: string; font: string; weight: number; italic?: boolean; caps?: boolean };

// Each cut from a different magazine. The fonts are the ones every computer
// has, which is how a ransom note looks anyway.
export const LETTERS: LetterLook[] = [
  { id: "ink", bg: "#17130f", fg: "#f5efe0", font: "Impact, 'Arial Narrow Bold', sans-serif", weight: 700, caps: true },
  { id: "paper", bg: "#f4eedd", fg: "#17130f", font: "Georgia, 'Times New Roman', serif", weight: 700 },
  { id: "red", bg: "#c93a2f", fg: "#fbf3e4", font: "'Trebuchet MS', Verdana, sans-serif", weight: 800, caps: true },
  { id: "blue", bg: "#2f6da3", fg: "#f6efde", font: "Georgia, serif", weight: 700, italic: true },
  { id: "sun", bg: "#ebc03a", fg: "#1c1710", font: "'Arial Black', Impact, sans-serif", weight: 900, caps: true },
  { id: "teal", bg: "#2a8c8c", fg: "#f7f1e1", font: "'Courier New', monospace", weight: 700 },
  { id: "leaf", bg: "#4f8a3e", fg: "#f8f2e2", font: "'Times New Roman', serif", weight: 700, italic: true },
  { id: "plain", bg: "#e7dfcb", fg: "#b2341f", font: "'Palatino Linotype', Palatino, serif", weight: 800 },
];

export const letterLook = (id: string | undefined): LetterLook => LETTERS.find((l) => l.id === id) ?? LETTERS[1]!;

export type PlacedLetter = { char: string; x: number; y: number; w: number; h: number; rotation: number; look: string };

// Lays a word out as letters cut from different places: each its own size,
// tilt and paper, in a row (gaps for spaces). Deterministic for a seed. The
// row is `size` tall at its tallest; `width` is how far it runs.
export function layoutRansom(text: string, seed: string, size = 72): { letters: PlacedLetter[]; width: number; height: number } {
  const rnd = seeded(seed);
  const letters: PlacedLetter[] = [];
  let x = 0;
  let last = "";
  for (const char of [...text.trim()]) {
    if (char.trim() === "") {
      x += size * 0.45;
      continue;
    }
    // Never the same paper twice running.
    let look = LETTERS[Math.floor(rnd() * LETTERS.length)]!.id;
    if (look === last) look = LETTERS[(LETTERS.findIndex((l) => l.id === look) + 1) % LETTERS.length]!.id;
    last = look;
    const h = size * (0.78 + rnd() * 0.22);
    const w = size * (0.58 + rnd() * 0.2);
    letters.push({
      char,
      x,
      // Sit on a loose baseline.
      y: (size - h) * rnd(),
      w,
      h,
      rotation: Math.round((rnd() - 0.5) * 14),
      look,
    });
    x += w + size * 0.04;
  }
  return { letters, width: Math.max(x - size * 0.04, size * 0.5), height: size };
}
