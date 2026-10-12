import { type JournalElement, PAGE } from "../../../convex/lib/journal";

// What a new thing on a page looks like before anyone moves it: its size, and
// a spot near the middle, a little further along each time so additions fan
// out instead of piling up.

export type NewThing = Omit<JournalElement, "id" | "x" | "y" | "z" | "rotation">;

const SIZES: Record<string, { w: number; h: number }> = {
  photo: { w: 340, h: 380 },
  sticker: { w: 260, h: 260 },
  title: { w: 520, h: 110 },
  note: { w: 420, h: 220 },
  map: { w: 380, h: 300 },
  tape: { w: 150, h: 38 },
  ticket: { w: 250, h: 100 },
  postmark: { w: 150, h: 150 },
  circle: { w: 280, h: 280 },
  triangles: { w: 140, h: 200 },
  dots: { w: 200, h: 200 },
  star: { w: 130, h: 130 },
  flower: { w: 140, h: 140 },
  butterfly: { w: 180, h: 150 },
  arrow: { w: 200, h: 100 },
};

export function sizeOf(kind: JournalElement["kind"], style?: string): { w: number; h: number } {
  if (kind !== "deco") return SIZES[kind]!;
  const family = style?.startsWith("tape") ? "tape" : style?.startsWith("circle") ? "circle" : style ?? "tape";
  return SIZES[family] ?? SIZES.tape!;
}

// Shapes sit behind what is on the page; everything else goes on top.
export const behind = (thing: Pick<JournalElement, "kind" | "style">) =>
  thing.kind === "deco" && (thing.style?.startsWith("circle") || thing.style === "triangles" || thing.style === "dots");

let fan = 0;

export function placed(thing: NewThing, on: JournalElement[], id: string): JournalElement {
  const { w, h } = { ...sizeOf(thing.kind, thing.style), ...("w" in thing && thing.w ? { w: thing.w, h: thing.h } : {}) };
  const k = (fan++ % 7) - 3;
  const zs = on.map((e) => e.z);
  const z = behind(thing) ? Math.min(0, ...zs) - 1 : Math.max(0, ...zs) + 1;
  return {
    ...thing,
    id,
    w,
    h,
    x: Math.round(PAGE.w / 2 - w / 2 + k * 28),
    y: Math.round(PAGE.h / 2 - h / 2 + k * 24),
    rotation: thing.kind === "title" || thing.kind === "map" ? 0 : k * 2,
    z,
  };
}

// An id for something new on a page.
export const newId = () => Math.random().toString(36).slice(2, 10);

// What carries the tape stuck across it when it moves.
const CARRIES = new Set<JournalElement["kind"]>(["photo", "sticker", "note", "map"]);

// The strips of tape lying across `e`: more than a third of each strip over it,
// and above it. They move with it, the way tape would.
export function tapedTo(e: JournalElement, all: JournalElement[]): JournalElement[] {
  if (!CARRIES.has(e.kind)) return [];
  return all.filter((t) => {
    if (t.kind !== "deco" || !t.style?.startsWith("tape") || t.z < e.z || t.locked) return false;
    const w = Math.max(0, Math.min(t.x + t.w, e.x + e.w) - Math.max(t.x, e.x));
    const h = Math.max(0, Math.min(t.y + t.h, e.y + e.h + 20) - Math.max(t.y, e.y - 20));
    return w * h > (t.w * t.h) / 3;
  });
}
