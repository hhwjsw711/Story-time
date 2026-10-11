import { describe, expect, test } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { centerOf, clampZoom, fitRect, flight, MAX_ZOOM, MIN_ZOOM, panBy, toScreen, toWorld, zoomAt } from "./camera";
import { History } from "./history";
import { FRAME_LOOKS, layoutRansom, LETTERS, seeded, tornPolygon } from "./look";
import { flowOf, frameAt, holdsLetters, indexNodes, nextZ, originOf, pick, ROOT, union, withChange, withDescendants, worldRect, type Node } from "./model";
import { normalize, resizeBox, turnTo } from "./transform";

const VIEW = { w: 1000, h: 600 };

describe("the camera", () => {
  test("world and screen are inverses", () => {
    const c = { x: 120, y: -40, zoom: 1.7 };
    const s = toScreen(c, 300, 200);
    const w = toWorld(c, s.x, s.y);
    expect(w.x).toBeCloseTo(300);
    expect(w.y).toBeCloseTo(200);
  });

  test("zooming keeps the point under the cursor where it is", () => {
    const c = { x: 0, y: 0, zoom: 1 };
    const before = toWorld(c, 400, 300);
    const next = zoomAt(c, 2, 400, 300);
    const after = toWorld(next, 400, 300);
    expect(next.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("zoom stays within limits", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 3, 0, 0).zoom).toBe(MAX_ZOOM);
  });

  test("panning moves by screen distance, at any zoom", () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 100, -50)).toEqual({ x: -50, y: 25, zoom: 2 });
  });

  test("fitting a rectangle centres it with room around", () => {
    const cam = fitRect({ x: 1000, y: 500, w: 1200, h: 800 }, VIEW, 0.1);
    expect(centerOf(cam, VIEW).x).toBeCloseTo(1600);
    expect(centerOf(cam, VIEW).y).toBeCloseTo(900);
    // 800 tall in 600 * 0.8 = 480 of room
    expect(cam.zoom).toBeCloseTo(0.6);
  });

  test("a small rectangle isn't blown up past the limit", () => {
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, VIEW, 0.1, 1.5).zoom).toBe(1.5);
  });
});

describe("flying between frames", () => {
  const a = fitRect({ x: 0, y: 0, w: 1200, h: 800 }, VIEW);
  const b = fitRect({ x: 6000, y: 3000, w: 1200, h: 800 }, VIEW);

  test("it starts at one and ends at the other", () => {
    const f = flight(a, b, VIEW);
    expect(f(0)).toEqual(expect.objectContaining({ zoom: expect.closeTo(a.zoom, 6) }));
    const end = f(1);
    expect(end.zoom).toBeCloseTo(b.zoom, 6);
    expect(end.x).toBeCloseTo(b.x, 4);
    expect(end.y).toBeCloseTo(b.y, 4);
  });

  test("a long trip backs out on the way, a short one hardly does", () => {
    const far = flight(a, b, VIEW)(0.5).zoom;
    expect(far).toBeLessThan(Math.min(a.zoom, b.zoom));
    const near = fitRect({ x: 50, y: 20, w: 1200, h: 800 }, VIEW);
    const short = flight(a, near, VIEW)(0.5).zoom;
    expect(short).toBeGreaterThan(far);
  });
});

const node = (id: string, over: Partial<Node> = {}): Node => ({
  _id: id as Id<"canvasNodes">,
  kind: "scrap",
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  rotation: 0,
  z: 0,
  ...over,
});

describe("the tree of things", () => {
  const frame = node("f1", { kind: "frame", x: 500, y: 300, w: 1000, h: 600, order: 2 });
  const second = node("f2", { kind: "frame", x: 3000, y: 0, w: 800, h: 600, order: 1, z: 1 });
  const title = node("t", { kind: "ransom", parentId: frame._id, x: 40, y: 50, w: 300, h: 80 });
  const letter = node("l", { kind: "letter", parentId: title._id, x: 10, y: 4, w: 50, h: 60, z: 2 });
  const loose = node("s", { x: -200, y: 40, z: 5 });
  const all = [frame, second, title, letter, loose];
  const tree = indexNodes(all);

  test("children are grouped by parent, back to front", () => {
    expect(tree.kids.get(ROOT)?.map((n) => n._id)).toEqual(["f1", "f2", "s"]);
    expect(tree.kids.get("t")?.map((n) => n._id)).toEqual(["l"]);
  });

  test("a nested thing's place in the world adds up its parents", () => {
    expect(originOf(letter, tree.byId)).toEqual({ x: 540, y: 350 });
    expect(worldRect(letter, tree.byId)).toEqual({ x: 550, y: 354, w: 50, h: 60 });
    expect(worldRect(loose, tree.byId)).toEqual({ x: -200, y: 40, w: 100, h: 100 });
  });

  test("the frame on top at a point, and none where there isn't one", () => {
    expect(frameAt(tree, 600, 400)?._id).toBe("f1");
    expect(frameAt(tree, 3100, 100)?._id).toBe("f2");
    expect(frameAt(tree, -100, 100)).toBeUndefined();
    expect(frameAt(tree, 600, 400, new Set(["f1"]))).toBeUndefined();
  });

  test("the flow is the frames with a place in it, in order", () => {
    expect(flowOf(all).map((n) => n._id)).toEqual(["f2", "f1"]);
  });

  test("a new piece goes above its neighbours", () => {
    expect(nextZ(tree, undefined)).toBe(6);
    expect(nextZ(tree, "f1")).toBe(1);
  });

  test("a click picks the piece, not the page; a title is picked whole until you go inside", () => {
    // pointer over a letter in a title on a frame, innermost first
    const chain = ["l", "t", "f1"];
    expect(pick(chain, tree.byId, undefined)).toBe("t");
    expect(pick(chain, tree.byId, "t")).toBe("l");
    // a loose piece, and the bare page of a frame
    expect(pick(["s"], tree.byId, "t")).toBe("s");
    expect(pick(["f1"], tree.byId, undefined)).toBe("f1");
    // having gone into a title, pressing another one picks that one whole
    expect(pick(chain, tree.byId, "other")).toBe("t");
  });

  test("only a title can be gone inside", () => {
    expect([frame, title, letter, loose].map(holdsLetters)).toEqual([false, true, false, false]);
  });

  test("the box around some rectangles", () => {
    expect(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 10, h: 10 }])).toEqual({ x: 0, y: -5, w: 30, h: 15 });
    expect(union([])).toBeUndefined();
  });
});

describe("looks", () => {
  test("the same seed gives the same numbers, another seed doesn't", () => {
    const a = seeded("piece-1");
    const b = seeded("piece-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded("piece-2")()).not.toBe(seeded("piece-1")());
  });

  test("a torn edge is the same every time, and only wobbles the sides asked for", () => {
    const edges = { top: true };
    expect(tornPolygon("x", edges)).toBe(tornPolygon("x", edges));
    expect(tornPolygon("x", edges)).not.toBe(tornPolygon("y", edges));
    // the bottom edge stays at 100%
    const polygon = tornPolygon("x", edges);
    expect(polygon).toContain("0.00% 100.00%");
    expect(polygon.startsWith("polygon(")).toBe(true);
  });

  test("a word becomes letters, one paper never twice in a row, gaps for spaces", () => {
    const { letters, width } = layoutRansom("Hi there", "title", 72);
    expect(letters.map((l) => l.char).join("")).toBe("Hithere");
    for (let i = 1; i < letters.length; i++) expect(letters[i]!.look).not.toBe(letters[i - 1]!.look);
    expect(letters.every((l) => LETTERS.some((p) => p.id === l.look))).toBe(true);
    // the gap between "Hi" and "there" is wider than between neighbouring letters
    const gapBetweenWords = letters[2]!.x - (letters[1]!.x + letters[1]!.w);
    const gapInside = letters[1]!.x - (letters[0]!.x + letters[0]!.w);
    expect(gapBetweenWords).toBeGreaterThan(gapInside * 3);
    expect(width).toBeGreaterThan(letters.at(-1)!.x);
  });

  test("the same word and seed lay out the same", () => {
    expect(layoutRansom("Berlin", "a")).toEqual(layoutRansom("Berlin", "a"));
    expect(layoutRansom("Berlin", "a")).not.toEqual(layoutRansom("Berlin", "b"));
  });

  test("every theme has page, ink and accent", () => {
    for (const l of FRAME_LOOKS) expect([l.page, l.ink, l.accent, l.surround].every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
  });
});

describe("history", () => {
  test("undo and redo walk the steps, and a new step clears what could be redone", async () => {
    const log: string[] = [];
    const step = (name: string) => ({
      undo: async () => void log.push(`undo ${name}`),
      redo: async () => void log.push(`redo ${name}`),
    });
    const h = new History();
    h.push(step("a"));
    h.push(step("b"));
    expect(await h.undo()).toBe(true);
    expect(await h.undo()).toBe(true);
    expect(await h.undo()).toBe(false);
    expect(await h.redo()).toBe(true);
    h.push(step("c"));
    expect(h.canRedo).toBe(false);
    expect(log).toEqual(["undo b", "undo a", "redo a"]);
  });

  test("a step that fails stays where it was", async () => {
    const h = new History();
    h.push({ undo: async () => Promise.reject(new Error("offline")), redo: async () => undefined });
    await expect(h.undo()).rejects.toThrow("offline");
    expect(h.canUndo).toBe(true);
  });
});

describe("resizing", () => {
  const box = { x: 100, y: 100, w: 200, h: 100, rotation: 0 };

  test("dragging the right edge grows the width and keeps the left edge", () => {
    expect(resizeBox(box, { hx: 1, hy: 0 }, 40, 999)).toEqual({ ...box, w: 240 });
  });

  test("dragging the left edge left grows it and keeps the right edge", () => {
    const next = resizeBox(box, { hx: -1, hy: 0 }, -30, 0);
    expect(next.w).toBe(230);
    expect(next.x + next.w).toBe(300);
  });

  test("a corner keeps the opposite corner still", () => {
    const next = resizeBox(box, { hx: 1, hy: 1 }, 20, 10);
    expect([next.x, next.y, next.w, next.h]).toEqual([100, 100, 220, 110]);
  });

  test("a corner can hold the shape", () => {
    const next = resizeBox(box, { hx: 1, hy: 1 }, 100, 0, true);
    expect(next.w / next.h).toBeCloseTo(2);
    expect(next.x).toBe(100);
  });

  test("it never gets smaller than the minimum", () => {
    expect(resizeBox(box, { hx: 1, hy: 0 }, -5000, 0).w).toBe(12);
  });

  test("a turned piece keeps its far side fixed in the world", () => {
    const turned = { x: 0, y: 0, w: 200, h: 100, rotation: 90 };
    // the world position of the piece's left-middle edge before and after
    const edge = (b: typeof turned, hx: number) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const a = (b.rotation * Math.PI) / 180;
      const lx = (hx * b.w) / 2;
      return { x: cx + Math.cos(a) * lx, y: cy + Math.sin(a) * lx };
    };
    // turned 90 degrees, its right side faces down: dragging it down 50 grows it by 50
    const next = resizeBox(turned, { hx: 1, hy: 0 }, 0, 50);
    expect(next.w).toBeCloseTo(250);
    const before = edge(turned, -1);
    const after = edge(next, -1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe("turning", () => {
  test("pointing straight up is no turn, to the right is a quarter turn", () => {
    const c = { x: 0, y: 0 };
    expect(turnTo(c, { x: 0, y: -50 })).toBeCloseTo(0);
    expect(turnTo(c, { x: 50, y: 0 })).toBeCloseTo(90);
    expect(turnTo(c, { x: -50, y: 0 })).toBeCloseTo(-90);
  });

  test("it can snap to steps", () => {
    // 81 degrees, to the nearest 15
    expect(turnTo({ x: 0, y: 0 }, { x: 50, y: -8 }, 15)).toBe(75);
  });

  test("angles wrap into -180 to 180", () => {
    expect(normalize(270)).toBe(-90);
    expect(normalize(-190)).toBe(170);
    expect(normalize(360)).toBe(0);
  });
});

describe("changes", () => {
  const base = node("a", { x: 1, y: 2, parentId: "p" as Id<"canvasNodes">, order: 3, text: "hi" });

  test("a change touches only what it names", () => {
    expect(withChange(base, { x: 9 })).toEqual({ ...base, x: 9 });
  });

  test("null takes a frame off its parent and out of the flow", () => {
    const next = withChange(base, { parentId: null, order: null });
    expect(next.parentId).toBeUndefined();
    expect(next.order).toBeUndefined();
  });

  test("a stray field, like the id a patch carries, is ignored", () => {
    expect(withChange(base, { x: 5, ...({ id: "other" } as object) })._id).toBe("a");
  });

  test("an id and everything inside it", () => {
    const tree = indexNodes([
      node("f", { kind: "frame" }),
      node("t", { kind: "ransom", parentId: "f" as Id<"canvasNodes"> }),
      node("l", { kind: "letter", parentId: "t" as Id<"canvasNodes"> }),
      node("s"),
    ]);
    expect([...withDescendants(tree, ["f"])].sort()).toEqual(["f", "l", "t"]);
  });
});
