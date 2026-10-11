import type { NodeView } from "../../../convex/canvas";
import type { Rect } from "./camera";

// The tree of things on a canvas, and where each one is in the world.

export type Node = NodeView;
export const ROOT = "";

export type Tree = { byId: Map<string, Node>; kids: Map<string, Node[]> };

// Everything by id, and each parent's children back to front.
export function indexNodes(nodes: Node[]): Tree {
  const byId = new Map(nodes.map((n) => [n._id as string, n]));
  const kids = new Map<string, Node[]>();
  for (const n of nodes) {
    const key = n.parentId ?? ROOT;
    kids.set(key, [...(kids.get(key) ?? []), n]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.z - b.z);
  return { byId, kids };
}

// Where a node's own space starts in the world: the sum of its ancestors'
// positions. Parents are never turned, so this is a plain offset.
export function originOf(node: Node, byId: Map<string, Node>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let p = node.parentId === undefined ? undefined : byId.get(node.parentId); p !== undefined; p = p.parentId === undefined ? undefined : byId.get(p.parentId)) {
    x += p.x;
    y += p.y;
  }
  return { x, y };
}

// A node's box in the world, before its own turn.
export function worldRect(node: Node, byId: Map<string, Node>): Rect {
  const o = originOf(node, byId);
  return { x: o.x + node.x, y: o.y + node.y, w: node.w, h: node.h };
}

export const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// The frame on top at a world point, skipping any in `skip`.
export function frameAt(tree: Tree, x: number, y: number, skip: ReadonlySet<string> = new Set()): Node | undefined {
  const frames = (tree.kids.get(ROOT) ?? []).filter((n) => n.kind === "frame" && !skip.has(n._id));
  return [...frames].reverse().find((f) => contains(worldRect(f, tree.byId), x, y));
}

// One above everything beside it.
export function nextZ(tree: Tree, parentId: string | undefined): number {
  const siblings = tree.kids.get(parentId ?? ROOT) ?? [];
  return siblings.reduce((top, n) => Math.max(top, n.z), 0) + 1;
}

// The frames that make up the flow, in the order they play.
export function flowOf(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => n.kind === "frame" && n.order !== undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.z - b.z);
}

export function union(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// What a click means. `chain` is the nodes under the pointer, innermost first.
// A frame is a page, not a group: pressing a piece on it picks the piece, and
// only the bare page picks the frame. A title is a group: it is picked whole,
// until you've gone inside it (`scope`), when its letters are picked one by one.
export function pick(chain: string[], byId: Map<string, Node>, scope: string | undefined): string | undefined {
  const pieces = chain.filter((id) => byId.get(id)?.kind !== "frame");
  if (pieces.length === 0) return chain.at(-1);
  return pieces.find((id) => byId.get(id)?.parentId === scope) ?? pieces.at(-1);
}

// Whether double-clicking goes inside it, to its letters.
export const holdsLetters = (n: Node) => n.kind === "ransom";

// The fields a patch may change, as `canvas.patch` takes them (without the id).
export type Change = Partial<Pick<Node, "x" | "y" | "w" | "h" | "rotation" | "z" | "text" | "look">> & {
  parentId?: Node["parentId"] | null;
  order?: number | null;
};

// A node with a change applied, the way the server will apply it, so the
// screen can show an edit before the server has heard of it.
const PLAIN = ["x", "y", "w", "h", "rotation", "z", "text", "look"] as const;

export function withChange(node: Node, change: Change): Node {
  const next: Node = { ...node };
  for (const key of PLAIN) {
    const value = change[key];
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  if (change.parentId !== undefined) next.parentId = change.parentId === null ? undefined : change.parentId;
  if (change.order !== undefined) next.order = change.order === null ? undefined : change.order;
  return next;
}

// An id and everything inside it.
export function withDescendants(tree: Tree, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const child of tree.kids.get(id) ?? []) visit(child._id);
  };
  for (const id of ids) visit(id);
  return out;
}
