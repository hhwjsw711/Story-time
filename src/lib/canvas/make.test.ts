import { describe, expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../../convex/_generated/dataModel";
import { copiesOf, newFrame, newMoment, newPhoto, newScrap, newTape, newTitle, piecesOfMoment, snapshotOf } from "./make";
import { indexNodes, type Node } from "./model";

const node = (id: string, over: Partial<Node> = {}): Node => ({
  _id: id as Id<"canvasNodes">,
  kind: "scrap",
  x: 10,
  y: 20,
  w: 100,
  h: 80,
  rotation: 0,
  z: 1,
  ...over,
});
const id = (s: string) => s as Id<"canvasNodes">;

describe("new things", () => {
  test("a frame is centred where you put it, in the next place in the flow", () => {
    expect(newFrame("poster", "peach", 3, { x: 1000, y: 500 }, "Berlin")).toEqual({
      kind: "frame", x: 400, y: 100, w: 1200, h: 800, look: "peach", order: 3, text: "Berlin",
    });
  });

  test("a scrap, a photo, a moment and tape are centred on the spot, with a small tilt", () => {
    const at = { x: 300, y: 200 };
    const scrap = newScrap("hi", "kraft", at);
    expect(scrap).toMatchObject({ kind: "scrap", x: 180, y: 130, w: 240, h: 140, look: "kraft", text: "hi" });
    expect(Math.abs(scrap.rotation ?? 0)).toBeLessThanOrEqual(4);
    expect(newPhoto("m1" as Id<"media">, "torn", at)).toMatchObject({ kind: "photo", mediaId: "m1", look: "torn", w: 280, h: 210 });
    expect(newMoment("mo1" as Id<"moments">, at)).toMatchObject({ kind: "moment", momentId: "mo1", w: 420, h: 360, rotation: 0 });
    expect(newTape("washi-red", at)).toMatchObject({ kind: "tape", w: 140, h: 36, look: "washi-red" });
  });

  test("a piece dropped on a frame goes in it", () => {
    expect(newScrap("x", "paper", { x: 50, y: 50, parent: id("frame1") }).parent).toBe("frame1");
  });

  test("a title is one group and a letter each, the letters inside the group", () => {
    const specs = newTitle("Berlin", { x: 600, y: 300, parent: id("frame1") }, 100, "seed");
    expect(specs[0]).toMatchObject({ kind: "ransom", parent: "frame1" });
    expect(specs.slice(1).map((s) => s.text).join("")).toBe("Berlin");
    expect(specs.slice(1).every((s) => s.kind === "letter" && typeof s.parent === "object" && s.parent?.ref === 0)).toBe(true);
    // centred on the point
    const group = specs[0]!;
    expect(group.x + group.w / 2).toBeCloseTo(600, -1);
  });

  test("nothing to cut is nothing added", () => {
    expect(newTitle("   ", { x: 0, y: 0 })).toEqual([]);
  });
});

describe("copying", () => {
  const frame = node("f", { kind: "frame", w: 1200, h: 800, order: 2, text: "Berlin" });
  const title = node("t", { kind: "ransom", parentId: id("f") });
  const a = node("a", { kind: "letter", parentId: id("t"), text: "A", look: "red" });
  const tree = indexNodes([frame, title, a, node("s", { parentId: id("f"), text: "hi" })]);

  test("a copy is nudged, keeps its place inside its frame and brings what's inside it", () => {
    const specs = copiesOf(["t"], tree);
    expect(specs.map((s) => s.kind)).toEqual(["ransom", "letter"]);
    expect(specs[0]).toMatchObject({ parent: "f", x: 34, y: 44 });
    // the letter points at its new title, and isn't nudged again
    expect(specs[1]).toMatchObject({ parent: { ref: 0 }, x: 10, y: 20, text: "A", look: "red" });
  });

  test("a copied frame stays out of the flow until it's put in", () => {
    expect(copiesOf(["f"], tree)[0]?.order).toBeUndefined();
  });
});

describe("putting things back", () => {
  const frame = node("f", { kind: "frame", order: 1 });
  const title = node("t", { kind: "ransom", parentId: id("f"), z: 2 });
  const l1 = node("l1", { kind: "letter", parentId: id("t"), text: "A" });
  const l2 = node("l2", { kind: "letter", parentId: id("t"), text: "B", z: 2 });
  const loose = node("s", { text: "hi" });
  const tree = indexNodes([frame, title, l1, l2, loose]);

  test("everything inside comes too, parents first, pointing at each other by position", () => {
    const snap = snapshotOf(["t"], tree);
    expect(snap.ids).toEqual(["t", "l1", "l2"]);
    // the title keeps pointing at its frame, which isn't in the set
    expect(snap.specs[0]).toMatchObject({ kind: "ransom", parent: "f", z: 2 });
    expect(snap.specs[1]).toMatchObject({ kind: "letter", parent: { ref: 0 }, text: "A" });
    expect(snap.specs[2]).toMatchObject({ parent: { ref: 0 }, text: "B", z: 2 });
  });

  test("a thing and something inside it, both asked for, come once", () => {
    expect(snapshotOf(["t", "l1"], tree).ids).toEqual(["t", "l1", "l2"]);
  });

  test("a whole frame keeps its place in the flow", () => {
    const snap = snapshotOf(["f"], tree);
    expect(snap.specs[0]).toMatchObject({ kind: "frame", order: 1 });
    expect(snap.ids).toEqual(["f", "t", "l1", "l2"]);
  });

  test("unknown ids are skipped", () => {
    expect(snapshotOf(["nope"], tree)).toEqual({ ids: [], specs: [] });
  });
});

describe("breaking a moment apart", () => {
  const moment = (blocks: MomentView["blocks"], stops: MomentView["stops"] = []): MomentView => ({
    _id: "m" as Id<"moments">,
    authorId: "u" as Id<"users">,
    startsAt: 0,
    blocks,
    stops,
    labels: [],
  });
  const photo = (n: number) => ({ type: "photo" as const, mediaId: `p${n}` as Id<"media"> });
  const piece = node("m1", { kind: "moment", x: 100, y: 100, w: 420, h: 360, parentId: id("f"), momentId: "m" as Id<"moments"> });

  test("each photo becomes a print and the words become a scrap, in the same frame", () => {
    const specs = piecesOfMoment(piece, moment([photo(1), { type: "note", text: "We got lost" }, photo(2)], [{ blocks: [photo(3)] }]));
    expect(specs.map((s) => s.kind)).toEqual(["photo", "photo", "photo", "scrap"]);
    expect(specs.every((s) => s.parent === "f")).toBe(true);
    expect(specs.filter((s) => s.kind === "photo").map((s) => s.mediaId)).toEqual(["p1", "p2", "p3"]);
    expect(specs.at(-1)).toMatchObject({ text: "We got lost", look: "kraft" });
    // inside the piece's own box, or just under it
    expect(specs.every((s) => s.x >= 100 - 30 && s.x <= 100 + 420)).toBe(true);
  });

  test("a moment of only words is one scrap, and an empty one is nothing", () => {
    expect(piecesOfMoment(piece, moment([{ type: "note", text: "Just this" }])).map((s) => s.kind)).toEqual(["scrap"]);
    expect(piecesOfMoment(piece, moment([]))).toEqual([]);
  });
});
