/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("the Japan trip seeds a whole experience, and its journal follows", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const eventId = await t.mutation(internal.seed.japan, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const me = t.withIdentity({ subject: userId });
  const event = await me.query(api.events.get, { eventId });
  expect(event).toMatchObject({ title: "Spring in Japan", role: "owner", status: "active", momentCount: 12, description: expect.stringContaining("Tokyo") });
  const moments = await me.query(api.moments.list, { eventId });
  expect(moments.map((m) => m.place)).toContain("Fushimi Inari Taisha, Kyoto");
  expect(moments.every((m) => m.tzOffsetMinutes === 540 && m.geo !== undefined)).toBe(true);
  // A cover and a page for every moment, cut without anyone opening the book.
  const book = await me.query(api.journal.outline, { eventId });
  expect(book.pages).toHaveLength(13);
});
