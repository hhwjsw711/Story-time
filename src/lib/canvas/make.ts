import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { MomentView } from "@/components/event/types";
import { FRAME_SIZES, layoutRansom, LETTERS, seeded } from "./look";
import { type Node, type Tree } from "./model";

// Things to put on the canvas, as `canvas.add` takes them. Positions are the
// top-left corner in the space of the parent (a frame, or the desk).

export type NewNode = FunctionArgs<typeof api.canvas.add>["nodes"][number];
type Where = { x: number; y: number; parent?: NewNode["parent"] };

const round = (n: number) => Math.round(n);

export function newFrame(size: (typeof FRAME_SIZES)[number]["id"], look: string, order: number, at: { x: number; y: number }, name?: string): NewNode {
  const s = FRAME_SIZES.find((f) => f.id === size) ?? FRAME_SIZES[0];
  return { kind: "frame", x: round(at.x - s.w / 2), y: round(at.y - s.h / 2), w: s.w, h: s.h, look, order, text: name };
}

export function newScrap(text: string, paper: string, at: Where): NewNode {
  const seed = seeded(`${text}${at.x}${at.y}`);
  return { kind: "scrap", parent: at.parent, x: round(at.x - 120), y: round(at.y - 70), w: 240, h: 140, rotation: round((seed() - 0.5) * 8), look: paper, text };
}

export function newPhoto(mediaId: NewNode["mediaId"], print: string, at: Where): NewNode {
  const seed = seeded(`${String(mediaId)}${at.x}`);
  return { kind: "photo", parent: at.parent, x: round(at.x - 140), y: round(at.y - 105), w: 280, h: 210, rotation: round((seed() - 0.5) * 8), look: print, mediaId };
}

export function newMoment(momentId: NewNode["momentId"], at: Where): NewNode {
  return { kind: "moment", parent: at.parent, x: round(at.x - 210), y: round(at.y - 180), w: 420, h: 360, rotation: 0, momentId };
}

export function newTape(look: string, at: Where): NewNode {
  const seed = seeded(`${look}${at.x}${at.y}`);
  return { kind: "tape", parent: at.parent, x: round(at.x - 70), y: round(at.y - 18), w: 140, h: 36, rotation: round((seed() - 0.5) * 40), look };
}

// A title cut from magazine letters: one thing for the whole word, and one
// for each letter, so any letter can be moved, turned or swapped on its own.
export function newTitle(text: string, at: Where, size = 110, seed = String(Math.random())): NewNode[] {
  const { letters, width, height } = layoutRansom(text, seed, size);
  if (letters.length === 0) return [];
  const group: NewNode = { kind: "ransom", parent: at.parent, x: round(at.x - width / 2), y: round(at.y - height / 2), w: round(width), h: round(height) };
  return [
    group,
    ...letters.map((l): NewNode => ({
      kind: "letter",
      parent: { ref: 0 },
      x: round(l.x),
      y: round(l.y),
      w: round(l.w),
      h: round(l.h),
      rotation: l.rotation,
      look: l.look,
      text: l.char,
    })),
  ];
}

// Copies of nodes (and what's inside them), offset a little, in one request.
// A copy of a thing inside a frame goes in the same frame.
export function copiesOf(ids: string[], tree: Tree, offset = 24): NewNode[] {
  const out: NewNode[] = [];
  const copy = (node: Node, parent: NewNode["parent"], shift: number) => {
    const at = out.length;
    out.push({
      kind: node.kind,
      parent,
      x: node.x + shift,
      y: node.y + shift,
      w: node.w,
      h: node.h,
      rotation: node.rotation,
      z: node.z + 1,
      momentId: node.momentId,
      mediaId: node.mediaId,
      text: node.text,
      look: node.look,
      // A copied frame stays out of the flow until it's put in.
    });
    for (const child of tree.kids.get(node._id) ?? []) copy(child, { ref: at }, 0);
  };
  for (const id of ids) {
    const node = tree.byId.get(id);
    if (node === undefined) continue;
    copy(node, node.parentId, offset);
  }
  return out;
}

// What a moment piece falls apart into: each of its photos as a print and its
// words as a scrap, laid out where the piece was, so each can be moved alone.
export function piecesOfMoment(node: Node, moment: MomentView): NewNode[] {
  const photos = [moment.blocks, ...moment.stops.map((s) => s.blocks)]
    .flat()
    .flatMap((b) => (b.type === "photo" ? [b.mediaId] : []))
    .slice(0, 6);
  const words = [moment.blocks, ...moment.stops.map((s) => s.blocks)]
    .flat()
    .flatMap((b) => (b.type === "note" || b.type === "feeling" ? [b.text] : []))[0];
  const seed = seeded(node._id);
  const out: NewNode[] = [];
  const cols = Math.min(photos.length, 3) || 1;
  const cell = node.w / cols;
  for (const [i, mediaId] of photos.entries()) {
    const w = Math.min(cell * 0.9, 240);
    out.push({
      kind: "photo",
      parent: node.parentId,
      x: round(node.x + (i % cols) * cell + (cell - w) / 2 + (seed() - 0.5) * 16),
      y: round(node.y + Math.floor(i / cols) * (w * 0.85) + seed() * 14),
      w: round(w),
      h: round(w * 0.75),
      rotation: round((seed() - 0.5) * 10),
      z: node.z + i,
      look: "print",
      mediaId,
    });
  }
  if (words !== undefined) {
    out.push({
      kind: "scrap",
      parent: node.parentId,
      x: round(node.x + node.w * 0.1),
      y: round(node.y + Math.max(node.h * 0.62, Math.ceil(photos.length / cols) * 190)),
      w: round(node.w * 0.8),
      h: 120,
      rotation: round((seed() - 0.5) * 5),
      z: node.z + photos.length,
      look: "kraft",
      text: words.slice(0, 240),
    });
  }
  return out;
}

export const RANSOM_LOOK_IDS = LETTERS.map((l) => l.id);

// Everything needed to put some nodes back exactly as they were: the nodes and
// all inside them, parents first, in the order `canvas.add` hands back ids.
// A node inside another that is in the set points to it by position; one whose
// parent isn't in the set keeps pointing at that parent.
export function snapshotOf(ids: Iterable<string>, tree: Tree): { ids: Node["_id"][]; specs: NewNode[] } {
  const wanted = new Set(ids);
  const inside = (node: Node) => {
    for (let p = node.parentId; p !== undefined; p = tree.byId.get(p)?.parentId) if (wanted.has(p)) return true;
    return false;
  };
  const done: Node["_id"][] = [];
  const specs: NewNode[] = [];
  const at = new Map<string, number>();
  const visit = (node: Node) => {
    const parent = node.parentId === undefined ? undefined : at.has(node.parentId) ? { ref: at.get(node.parentId)! } : node.parentId;
    at.set(node._id, specs.length);
    done.push(node._id);
    specs.push({
      kind: node.kind,
      parent,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      rotation: node.rotation,
      z: node.z,
      momentId: node.momentId,
      mediaId: node.mediaId,
      text: node.text,
      look: node.look,
      order: node.order,
    });
    for (const child of tree.kids.get(node._id) ?? []) visit(child);
  };
  for (const id of wanted) {
    const node = tree.byId.get(id);
    if (node !== undefined && !inside(node)) visit(node);
  }
  return { ids: done, specs };
}
