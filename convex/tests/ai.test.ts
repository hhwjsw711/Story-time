/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { transportFromSpeed } from "../ai/decide";
import { titleFromHtml } from "../ai/unfurl";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 5, 1, 12);
const LISBON = { lat: 38.7223, lng: -9.1393 };
const SINTRA = { lat: 38.8029, lng: -9.3817 };
const PORTO = { lat: 41.1579, lng: -8.6291 };
const FARO = { lat: 37.0194, lng: -7.9322 };

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, eventId, owner, helper: as(helperId), viewer: as(viewerId) };
}

describe("decide: the legs of a journey", () => {
  test("each stop after the first is a leg; distance and speed only where both ends allow", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      geo: LISBON,
      blocks: [{ type: "note", text: "start" }],
      stops: [
        { place: "Sintra", geo: SINTRA, startsAt: T0 + HOUR, blocks: [] },
        { place: "Cascais", startsAt: T0 + 2 * HOUR, blocks: [{ type: "note", text: "sea" }] },
      ],
      labels: ["day trip"],
    });

    const { labels, legs, route } = await t.query(internal.ai.decide.legsOf, { momentId });
    expect(route).toEqual(["Lisbon", "Sintra", "Cascais"]);
    expect(labels).toEqual(["day trip"]);
    expect(legs).toHaveLength(2);
    const [toSintra, toCascais] = legs;
    expect(toSintra).toMatchObject({
      id: "1",
      stopIndex: 1,
      fromPlace: "Lisbon",
      toPlace: "Sintra",
      minutes: 60,
    });
    expect(toSintra?.km).toBeGreaterThan(20);
    expect(toSintra?.km).toBeLessThan(25);
    expect(toSintra?.kmh).toBeCloseTo(toSintra?.km ?? 0, 0);
    expect(toCascais).toMatchObject({
      id: "2",
      stopIndex: 2,
      fromPlace: "Sintra",
      toPlace: "Cascais",
      minutes: 60,
    });
    expect(toCascais).not.toHaveProperty("km");
    expect(toCascais).not.toHaveProperty("kmh");
  });

  test("the first stop is a leg from the moment just before it, within 12 hours", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0 - 2 * HOUR,
      tzOffsetMinutes: 0,
      place: "Porto",
      geo: PORTO,
      blocks: [{ type: "note", text: "earlier" }],
    });
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      geo: LISBON,
      blocks: [{ type: "note", text: "now" }],
    });

    const { legs } = await t.query(internal.ai.decide.legsOf, { momentId });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ id: "0", stopIndex: 0, fromPlace: "Porto", toPlace: "Lisbon", minutes: 120 });
    expect(legs[0]?.km).toBeGreaterThan(200);
  });

  test("a moment more than 12 hours earlier does not link", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0 - 13 * HOUR,
      tzOffsetMinutes: 0,
      place: "Faro",
      geo: FARO,
      blocks: [{ type: "note", text: "earlier" }],
    });
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      geo: LISBON,
      blocks: [{ type: "note", text: "now" }],
    });

    const { legs } = await t.query(internal.ai.decide.legsOf, { momentId });
    expect(legs).toEqual([]);
  });
});

describe("decide: the speed fallback", () => {
  test("maps km/h to the transport that speed suggests", () => {
    expect(transportFromSpeed(3)).toBe("walk");
    expect(transportFromSpeed(6.9)).toBe("walk");
    expect(transportFromSpeed(7)).toBe("bike");
    expect(transportFromSpeed(24.9)).toBe("bike");
    expect(transportFromSpeed(25)).toBe("car");
    expect(transportFromSpeed(159.9)).toBe("car");
    expect(transportFromSpeed(160)).toBe("plane");
  });
});

describe("decideTransport: without Jev, speed decides", () => {
  test("a stop's transport comes from its speed, and the decision is saved", async () => {
    const { t, owner, eventId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      geo: LISBON,
      blocks: [{ type: "note", text: "start" }],
      stops: [
        { place: "Sintra", geo: SINTRA, startsAt: T0 + HOUR, blocks: [] },
        { place: "Cascais", startsAt: T0 + 2 * HOUR, blocks: [] },
      ],
    });

    // The gateway can't mint a token under convex-test, so the call fails fast.
    const decided = await t.action(internal.ai.decide.decideTransport, { momentId });
    expect(decided).toEqual({ transports: { "1": "bike" } });

    const [m] = await owner.query(api.moments.list, { eventId });
    expect(m?.stops[0]?.transport).toBe("bike");
    expect(m?.stops[1]?.transport).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Jev skipped the transport decision:", expect.any(String));
    warn.mockRestore();
  });
});

describe("unfurl: page titles", () => {
  test("reads the title, decodes basic entities, and drops empty ones", () => {
    expect(titleFromHtml("<html><head><title>  Ponte &amp; Co &#8211;\n2026 </title></head></html>")).toBe(
      "Ponte & Co – 2026",
    );
    expect(titleFromHtml("<title>&lt;b&gt;bold&lt;/b&gt;</title>")).toBe("<b>bold</b>");
    expect(titleFromHtml("<title>   </title>")).toBeUndefined();
    expect(titleFromHtml("no title here")).toBeUndefined();
  });
});

describe("apply: AI fill-ins only fill gaps", () => {
  test("fills an empty moment and logs the change as the agent Scribe, with no person", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      blocks: [{ type: "link", url: "https://example.com/tram" }],
      stops: [{ place: "Sintra", blocks: [] }],
    });

    await t.mutation(internal.ai.apply.apply, {
      momentId,
      note: "We rode the tram up to the castle",
      labels: ["castle"],
      transports: { "0": "walk", "1": "train" },
    });

    const [m] = await owner.query(api.moments.list, { eventId });
    expect(m?.blocks).toEqual([
      { type: "link", url: "https://example.com/tram" },
      { type: "note", text: "We rode the tram up to the castle" },
    ]);
    expect(m?.labels).toEqual(["castle"]);
    expect(m?.transport).toBe("walk");
    expect(m?.stops[0]?.transport).toBe("train");

    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    const edit = changes.find((r) => r.entity === "moment" && r.action === "update");
    expect(edit?.actorId).toBeUndefined();
    expect(edit?.agent).toBe("Scribe");
    expect(edit?.fields).toEqual(expect.arrayContaining(["blocks", "labels", "transport", "stops"]));
    expect(JSON.stringify(changes)).not.toMatch(/castle|tram/);
  });

  test("leaves what people wrote alone, and writes nothing when there is nothing to fill", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      place: "Lisbon",
      transport: "walk",
      blocks: [{ type: "note", text: "my words" }],
      labels: ["food"],
      stops: [{ place: "Sintra", transport: "train", blocks: [{ type: "note", text: "later" }] }],
    });
    const before = await t.run((ctx) => ctx.db.query("changes").collect());

    await t.mutation(internal.ai.apply.apply, {
      momentId,
      note: "AI words",
      mood: "😊",
      labels: ["museum"],
      transports: { "0": "car", "1": "bus" },
    });

    const [m] = await owner.query(api.moments.list, { eventId });
    expect(m).toMatchObject({
      blocks: [{ type: "note", text: "my words" }],
      labels: ["food"],
      transport: "walk",
    });
    expect(m?.stops[0]?.transport).toBe("train");
    const after = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(after).toHaveLength(before.length);
  });

  test("link titles fill only links that have none", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      tzOffsetMinutes: 0,
      blocks: [{ type: "link", url: "https://example.com/castle" }],
    });

    await t.mutation(internal.ai.apply.apply, {
      momentId,
      linkTitles: [{ stopIndex: 0, blockIndex: 0, title: "The castle" }],
    });
    await t.mutation(internal.ai.apply.apply, {
      momentId,
      linkTitles: [{ stopIndex: 0, blockIndex: 0, title: "Something else" }],
    });

    const [m] = await owner.query(api.moments.list, { eventId });
    expect(m?.blocks).toEqual([{ type: "link", url: "https://example.com/castle", title: "The castle" }]);
  });
});

describe("enrich: who may ask", () => {
  test("a contributor can't enrich someone else's moment, and a viewer can't enrich at all", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const ownersMoment = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      blocks: [{ type: "note", text: "owner's" }],
    });
    const helpersMoment = await helper.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      blocks: [{ type: "note", text: "helper's" }],
    });

    await expect(
      helper.action(api.ai.enrich.enrich, { momentId: ownersMoment }),
    ).rejects.toThrow(/own moments/);
    await expect(
      viewer.action(api.ai.enrich.enrich, { momentId: helpersMoment }),
    ).rejects.toThrow(/Event not found/);
  });
});

describe("scribe: what it is told about a moment", () => {
  test("its context carries the zone the moment happened in, for the clock time", async () => {
    const { t, owner, eventId } = await setup();
    // 22:15 UTC on 8 November: 07:15 on the 9th in Japan.
    const startsAt = Date.UTC(2025, 10, 8, 22, 15);
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt,
      tzOffsetMinutes: 540,
      place: "Kyoto",
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    const context = await t.query(internal.ai.scribe.context, { momentId });
    expect(context).toMatchObject({ startsAt, tzOffsetMinutes: 540 });
  });
});
