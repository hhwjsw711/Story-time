/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, viewerId, strangerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, owner, viewer: as(viewerId), stranger: as(strangerId), eventId };
}

describe("activity badge", () => {
  test("counts new moments, pages and guestbook notes, then clears when opened", async () => {
    const { t, owner, viewer, stranger, eventId } = await setup();
    expect(await owner.query(api.changes.unreadCount, { eventId })).toBe(0);
    await expect(stranger.query(api.changes.unreadCount, { eventId })).rejects.toThrow(/Event not found/);
    await expect(viewer.query(api.changes.unreadCount, { eventId })).rejects.toThrow(/Event not found/);

    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      place: "Lisbon",
      blocks: [{ type: "note", text: "Tram 28" }],
    });
    await t.finishAllScheduledFunctions(() => undefined);
    const afterMoment = await owner.query(api.changes.unreadCount, { eventId });
    // The moment, its page, and the cover.
    expect(afterMoment).toBe(3);

    await owner.mutation(api.changes.markRead, { eventId });
    expect(await owner.query(api.changes.unreadCount, { eventId })).toBe(0);

    await viewer.mutation(api.guestNotes.leave, { eventId, text: "Wish I had been there" });
    expect(await owner.query(api.changes.unreadCount, { eventId })).toBe(1);
    const notes = await owner.query(api.guestNotes.list, { eventId });
    expect(notes.map((n) => n.text)).toEqual(["Wish I had been there"]);
    const stored = await t.run((ctx) => ctx.db.query("guestNotes").collect());
    expect(JSON.stringify(stored)).not.toContain("Wish I had been there");
    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(JSON.stringify(changes)).not.toContain("Wish I had been there");
    expect(changes.some((c) => c.entity === "guestNote" && c.action === "create")).toBe(true);
    expect(changes.some((c) => c.entity === "page" && c.action === "create")).toBe(true);

    await expect(stranger.mutation(api.guestNotes.leave, { eventId, text: "Hello" })).rejects.toThrow(/Event not found/);
    await expect(viewer.mutation(api.guestNotes.leave, { eventId, text: "   " })).rejects.toThrow(/500/);
  });
});
