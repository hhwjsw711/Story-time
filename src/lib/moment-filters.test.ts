import { expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { isFiltering, matches, noFilters } from "./moment-filters";

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: new Date(2025, 1, 4, 13, 0).getTime(),
  blocks: [],
  stops: [],
  labels: [],
  ...over,
});

test("search, place, contains, author and date filters", () => {
  const hanover = moment({
    place: "Hanover",
    blocks: [{ type: "note", text: "Coffee by the lake" }],
  });
  const none = moment({ blocks: [{ type: "photo", mediaId: "p" as Id<"media"> }] });

  expect(matches(hanover, noFilters)).toBe(true);
  expect(matches(hanover, { ...noFilters, search: "LAKE" })).toBe(true);
  expect(matches(none, { ...noFilters, search: "lake" })).toBe(false);

  expect(matches(none, { ...noFilters, places: [""] })).toBe(true);
  expect(matches(hanover, { ...noFilters, places: [""] })).toBe(false);

  expect(matches(none, { ...noFilters, contains: ["photo"] })).toBe(true);
  expect(matches(hanover, { ...noFilters, contains: ["photo", "note"] })).toBe(false);

  expect(matches(hanover, { ...noFilters, authors: ["u1"] })).toBe(true);
  expect(matches(hanover, { ...noFilters, authors: ["u2"] })).toBe(false);

  // Later stops count for search and contains; labels match any.
  const trip = moment({
    stops: [{ place: "Sintra", transport: "train", blocks: [{ type: "video", mediaId: "v" as Id<"media"> }] }],
    labels: ["museum", "food"],
  });
  expect(matches(trip, { ...noFilters, search: "sintra" })).toBe(true);
  expect(matches(trip, { ...noFilters, contains: ["video"] })).toBe(true);
  expect(matches(trip, { ...noFilters, labels: ["food", "beach"] })).toBe(true);
  expect(matches(trip, { ...noFilters, labels: ["beach"] })).toBe(false);

  const feb4 = new Date(2025, 1, 4);
  const feb5 = new Date(2025, 1, 5);
  expect(matches(hanover, { ...noFilters, from: feb4 })).toBe(true);
  expect(matches(hanover, { ...noFilters, from: feb5 })).toBe(false);
  expect(matches(hanover, { ...noFilters, from: new Date(2025, 1, 1), to: feb4 })).toBe(true);
});

test("dates match the author's day when the itinerary knows it", () => {
  // 23:30 on Feb 4 for the viewer, but logged on Feb 5 where the author was.
  const late = { ...moment({ startsAt: new Date(2025, 1, 4, 23, 30).getTime() }), dayKey: "2025-02-05" };
  const feb4 = new Date(2025, 1, 4);
  const feb5 = new Date(2025, 1, 5);
  expect(matches(late, { ...noFilters, from: feb5 })).toBe(true);
  expect(matches(late, { ...noFilters, from: feb4 })).toBe(false);
  expect(matches(late, { ...noFilters, from: feb4, to: feb5 })).toBe(true);
});

test("without the itinerary's day, dates match the day in the zone the moment happened in", () => {
  // 22:15 UTC on Feb 4 is 07:15 on Feb 5 in Japan.
  const kyoto = moment({ startsAt: Date.UTC(2025, 1, 4, 22, 15), tzOffsetMinutes: 540 });
  expect(matches(kyoto, { ...noFilters, from: new Date(2025, 1, 5) })).toBe(true);
  expect(matches(kyoto, { ...noFilters, from: new Date(2025, 1, 4) })).toBe(false);
});

test("agents filter keeps people's moments, agents' moments, or both", () => {
  const person = moment({ authorName: "Sara" });
  const agent = moment({ authorName: "Sara", authorAgent: "Scribe" });

  // The default keeps both.
  expect(matches(person, noFilters)).toBe(true);
  expect(matches(agent, noFilters)).toBe(true);

  expect(matches(person, { ...noFilters, agents: "only" })).toBe(false);
  expect(matches(agent, { ...noFilters, agents: "only" })).toBe(true);

  expect(matches(person, { ...noFilters, agents: "hide" })).toBe(true);
  expect(matches(agent, { ...noFilters, agents: "hide" })).toBe(false);
});

test("agents filter combines with the other filters", () => {
  const note = [{ type: "note" as const, text: "Coffee by the lake" }];
  const scribeLake = moment({ authorAgent: "Scribe", place: "Hanover", blocks: note });
  const personLake = moment({ place: "Hanover", blocks: note });
  const scribePhoto = moment({ authorAgent: "Scribe", blocks: [{ type: "photo", mediaId: "p" as Id<"media"> }] });

  expect(matches(scribeLake, { ...noFilters, agents: "only", search: "lake" })).toBe(true);
  expect(matches(personLake, { ...noFilters, agents: "only", search: "lake" })).toBe(false);
  // Passes the agents filter, fails the contains filter.
  expect(matches(scribePhoto, { ...noFilters, agents: "only", contains: ["note"] })).toBe(false);

  expect(matches(personLake, { ...noFilters, agents: "hide", places: ["Hanover"] })).toBe(true);
  expect(matches(scribeLake, { ...noFilters, agents: "hide", places: ["Hanover"] })).toBe(false);
});

test("an agent's name is searchable", () => {
  expect(matches(moment({ authorName: "Sara", authorAgent: "Scribe" }), { ...noFilters, search: "scribe" })).toBe(true);
  expect(matches(moment({ authorName: "Sara" }), { ...noFilters, search: "scribe" })).toBe(false);
});

test("only a narrowed agents filter counts as filtering", () => {
  expect(isFiltering(noFilters)).toBe(false);
  expect(isFiltering({ ...noFilters, agents: "only" })).toBe(true);
  expect(isFiltering({ ...noFilters, agents: "hide" })).toBe(true);
});
