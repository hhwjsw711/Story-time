import type { MomentView } from "@/components/event/types";

export type Transport = NonNullable<MomentView["transport"]>;
export type Stop = MomentView["stops"][number];
export type LatLng = NonNullable<Stop["geo"]>;

export type StoryStep =
  | { kind: "title" }
  | {
      kind: "travel";
      from: string;
      to: string;
      // Where each end is, when both places were picked on a map.
      fromGeo?: LatLng;
      toGeo?: LatLng;
      transport: Transport;
      momentId: string;
      stopIndex: number;
    }
  | {
      kind: "stop";
      momentId: string;
      stopIndex: number;
      stop: Stop;
      // The first stop of the whole story: the camera opens on it.
      first: boolean;
      authorId: string;
      authorName?: string;
      labels: string[];
      // Its name on the map, unique to this stop unless it's a real place.
      place: string;
    }
  | { kind: "end" };

// The first stop lives on the moment itself; later ones in `stops`.
export function stopsOf(m: MomentView): Stop[] {
  return [{ startsAt: m.startsAt, place: m.place, geo: m.geo, transport: m.transport, blocks: m.blocks }, ...m.stops];
}

// A stop without a place is numbered through the whole story, so two of
// them never land on the same spot of the map.
export const placeLabel = (stop: Stop, n: number) => stop.place || `Stop ${n + 1}`;

// Turns an experience and its moments into the ordered scenes of the story.
// Moments play in time order. Before any stop that records how they got
// there, a travel scene runs from the previous place (or the title, for the
// very first) to this one.
export function buildStorySteps(title: string, moments: MomentView[]): StoryStep[] {
  const steps: StoryStep[] = [{ kind: "title" }];
  const ordered = [...moments].sort((a, b) => a.startsAt - b.startsAt);
  let previousPlace = title;
  let previousGeo: LatLng | undefined;
  let n = 0;
  for (const moment of ordered) {
    const stops = stopsOf(moment);
    stops.forEach((stop, stopIndex) => {
      const to = placeLabel(stop, n);
      if (stop.transport !== undefined) {
        steps.push({
          kind: "travel",
          from: previousPlace,
          to,
          fromGeo: previousGeo,
          toGeo: stop.geo,
          transport: stop.transport,
          momentId: moment._id,
          stopIndex,
        });
      }
      steps.push({
        kind: "stop",
        momentId: moment._id,
        stopIndex,
        stop,
        first: n === 0,
        authorId: moment.authorId,
        authorName: moment.authorName,
        labels: moment.labels,
        place: to,
      });
      n++;
      previousPlace = to;
      previousGeo = stop.geo;
    });
  }
  steps.push({ kind: "end" });
  return steps;
}

export const clampStep = (step: number, steps: StoryStep[]) =>
  Math.min(Math.max(Math.trunc(step) || 0, 0), Math.max(steps.length - 1, 0));

// Index of the first scene showing this moment, for deep links from the page.
export function stepForMoment(steps: StoryStep[], momentId: string): number {
  const i = steps.findIndex((s) => s.kind === "stop" && s.momentId === momentId);
  return i === -1 ? 0 : i;
}
