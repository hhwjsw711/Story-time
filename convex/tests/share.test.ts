/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, guestId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  return { t, ownerId, owner, guest: as(guestId), eventId };
}

type Owner = Awaited<ReturnType<typeof setup>>["owner"];

// A photo attached to a moment of `eventId`, the way the app makes one.
async function momentWithPhoto(owner: Owner, eventId: Id<"events">) {
  const { mediaId } = await owner.mutation(api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/jpeg",
  });
  await owner.mutation(api.media.confirmUpload, { mediaId });
  await owner.mutation(api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    place: "Lisbon",
    blocks: [{ type: "photo", mediaId }, { type: "note", text: "Tram 28" }],
  });
  return mediaId;
}

// The link is `<origin>/s#<token>`: the token is the fragment.
const tokenOf = (link: string) => link.slice(link.indexOf("#") + 1);

describe("share links", () => {
  test("an experience has no link until its owner switches one on", async () => {
    const { owner, eventId } = await setup();
    expect(await owner.query(api.share.link, { eventId })).toBeNull();
    expect((await owner.query(api.events.get, { eventId }))?.visibility).toBe("private");
  });

  test("a link opens the story with no account, and names no one", async () => {
    const { t, ownerId, owner, eventId } = await setup();
    await momentWithPhoto(owner, eventId);
    const link = await owner.mutation(api.share.enable, { eventId });
    expect(link).toMatch(/\/s#[A-Za-z0-9_-]{20,64}$/);
    // Switching on again hands back the same link.
    expect(await owner.mutation(api.share.enable, { eventId })).toBe(link);
    expect(await owner.query(api.share.link, { eventId })).toBe(link);
    expect((await owner.query(api.events.get, { eventId }))?.visibility).toBe("link");

    const story = await t.query(api.share.get, { token: tokenOf(link) });
    expect(story?.event).toMatchObject({ _id: eventId, title: "Untitled experience", momentCount: 1 });
    expect(story?.moments).toHaveLength(1);
    expect(story?.moments[0]?.place).toBe("Lisbon");
    expect(story?.moments[0]?.blocks.map((b) => b.type)).toEqual(["photo", "note"]);
    expect(story?.moments[0]).not.toHaveProperty("authorId");
    expect(story?.moments[0]).not.toHaveProperty("authorName");
    expect(JSON.stringify(story)).not.toContain(ownerId);
  });

  test("a shared story carries each moment's offset, so its times read where it happened", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: Date.UTC(2025, 10, 8, 22, 15),
      tzOffsetMinutes: 540,
      place: "Kyoto",
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));
    const story = await t.query(api.share.get, { token });
    expect(story?.moments[0]?.tzOffsetMinutes).toBe(540);
  });

  test("disabling the link closes it, and switching on again makes a new one", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));
    await owner.mutation(api.share.disable, { eventId });
    expect(await t.query(api.share.get, { token })).toBeNull();
    expect(await owner.query(api.share.link, { eventId })).toBeNull();
    expect((await owner.query(api.events.get, { eventId }))?.visibility).toBe("private");

    const again = await owner.mutation(api.share.enable, { eventId });
    expect(tokenOf(again)).not.toBe(token);
  });

  test("rotating makes a new link and the old one stops working", async () => {
    const { t, owner, eventId } = await setup();
    const first = await owner.mutation(api.share.enable, { eventId });
    const second = await owner.mutation(api.share.rotate, { eventId });
    expect(second).not.toBe(first);
    expect(await t.query(api.share.get, { token: tokenOf(first) })).toBeNull();
    expect(await t.query(api.share.get, { token: tokenOf(second) })).not.toBeNull();
    expect(await owner.query(api.share.link, { eventId })).toBe(second);
  });

  test("malformed and unknown tokens read the same: no story", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));
    const mediaId = await momentWithPhoto(owner, eventId);
    const bad = ["", "short", "x".repeat(65), `${token}=`, "bad token with spaces!", token.slice(1)];
    for (const candidate of bad) {
      expect(await t.query(api.share.get, { token: candidate })).toBeNull();
      expect(await t.query(api.share.mediaForShare, { token: candidate, mediaId })).toBeNull();
    }
    // Well-formed, but never issued.
    expect(await t.query(api.share.get, { token: "A".repeat(32) })).toBeNull();
  });

  test("a picture comes through a link only from a moment of that experience", async () => {
    const { t, owner, eventId } = await setup();
    const onMoment = await momentWithPhoto(owner, eventId);
    // Uploaded but never attached to a moment.
    const { mediaId: loose } = await owner.mutation(api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/jpeg",
    });
    await owner.mutation(api.media.confirmUpload, { mediaId: loose });
    // A picture from another experience.
    const other = await owner.mutation(api.events.createDraft, {});
    const elsewhere = await momentWithPhoto(owner, other);
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));

    expect(await t.query(api.share.mediaForShare, { token, mediaId: onMoment })).toMatchObject({
      mime: "image/jpeg",
      keyScope: eventId,
    });
    expect(await t.query(api.share.mediaForShare, { token, mediaId: loose })).toBeNull();
    expect(await t.query(api.share.mediaForShare, { token, mediaId: elsewhere })).toBeNull();
  });

  test("only the owner can switch a link on, and archived experiences can't", async () => {
    const { owner, guest, eventId } = await setup();
    await expect(guest.mutation(api.share.enable, { eventId })).rejects.toThrow(/Event not found/);
    await expect(guest.query(api.share.link, { eventId })).rejects.toThrow(/Event not found/);

    await owner.mutation(api.events.update, { eventId, status: "archived" });
    await expect(owner.mutation(api.share.enable, { eventId })).rejects.toThrow(/ARCHIVED/);
    await expect(owner.mutation(api.share.rotate, { eventId })).rejects.toThrow(/ARCHIVED/);
  });

  test("the change log records that a link changed, never the link", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test("taking visibility off through events.update switches the link off", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.share.enable, { eventId }));
    await owner.mutation(api.events.update, { eventId, visibility: "private" });
    expect(await t.query(api.share.get, { token })).toBeNull();
    expect(await owner.query(api.share.link, { eventId })).toBeNull();
  });
});
