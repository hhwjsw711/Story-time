import { describe, expect, test } from "vitest";
import type { JournalElement } from "../../../convex/lib/journal";
import { behind, placed, sizeOf, tapedTo } from "./add";
import { journalFile, readJournalFile } from "./export";

const el = (over: Partial<JournalElement>): JournalElement => ({ id: "x", kind: "photo", x: 100, y: 100, w: 300, h: 300, rotation: 0, z: 5, mediaId: "m", ...over });

describe("adding to a page", () => {
  test("a new thing gets its kind's size and goes on top; a shape goes behind", () => {
    const page = [el({ id: "a", z: 4 }), el({ id: "b", z: 9 })];
    const title = placed({ kind: "title", style: "dada", text: "Hi", w: 0, h: 0 }, page, "t");
    expect(title).toMatchObject({ id: "t", ...sizeOf("title"), z: 10, rotation: 0 });
    const circle = placed({ kind: "deco", style: "circle-teal", w: 0, h: 0 }, page, "c");
    expect(circle.z).toBe(-1);
    expect(behind(circle)).toBe(true);
    expect(sizeOf("deco", "tape-rose")).toEqual(sizeOf("deco", "tape"));
  });

  test("things added one after another fan out instead of piling up", () => {
    const spots = new Set(Array.from({ length: 5 }, (_, i) => {
      const p = placed({ kind: "note", text: "", w: 0, h: 0 }, [], `n${i}`);
      return `${p.x},${p.y}`;
    }));
    expect(spots.size).toBe(5);
  });
});

describe("tape", () => {
  test("a strip across a photo's top moves with it; one elsewhere, under it, or locked stays", () => {
    const photo = el({ id: "p", x: 100, y: 100, w: 300, h: 300, z: 5 });
    const across = el({ id: "t1", kind: "deco", style: "tape", mediaId: undefined, x: 180, y: 84, w: 140, h: 36, z: 6 });
    const away = el({ id: "t2", kind: "deco", style: "tape", mediaId: undefined, x: 600, y: 600, w: 140, h: 36, z: 6 });
    const under = el({ id: "t3", kind: "deco", style: "tape-rose", mediaId: undefined, x: 180, y: 84, w: 140, h: 36, z: 1 });
    const stuck = el({ id: "t4", kind: "deco", style: "tape", mediaId: undefined, x: 180, y: 84, w: 140, h: 36, z: 7, locked: true });
    expect(tapedTo(photo, [photo, across, away, under, stuck]).map((t) => t.id)).toEqual(["t1"]);
  });

  test("a title carries nothing", () => {
    const title = el({ id: "title", kind: "title", mediaId: undefined });
    expect(tapedTo(title, [el({ id: "t", kind: "deco", style: "tape", z: 9 })])).toEqual([]);
  });
});

describe("journal files", () => {
  test("a saved journal reads back page for page", async () => {
    const pages = [{ paper: "kraft", elements: [el({ id: "a" }), el({ id: "b", kind: "title", text: "Hello", mediaId: undefined })] }];
    const blob = journalFile("Lisbon", pages);
    const back = await readJournalFile(new File([await blob.text()], "lisbon.journal.json"));
    expect(back).toEqual(pages);
  });

  test("something that isn't a journal file is refused; broken things inside are dropped", async () => {
    await expect(readJournalFile(new File(["not json"], "x.json"))).rejects.toThrow(/journal file/);
    await expect(readJournalFile(new File([JSON.stringify({ kind: "other" })], "x.json"))).rejects.toThrow(/journal file/);
    const file = new File([JSON.stringify({ kind: "story-time-journal", version: 1, pages: [{ paper: "cream", elements: [{ id: "ok", kind: "note", x: 1, y: 1, w: 9, h: 9, rotation: 0, z: 1 }, { id: "bad" }] }, { nope: true }] })], "x.json");
    const back = await readJournalFile(file);
    expect(back).toHaveLength(1);
    expect(back[0]!.elements.map((e) => e.id)).toEqual(["ok"]);
  });
});
