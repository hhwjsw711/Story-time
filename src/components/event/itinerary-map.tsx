import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MomentView } from "@/components/event/types";
import { Map as MapView, MapControls, MapMarker, MapRoute, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { bounds, mapPoints, type MapPoint } from "@/lib/map-points";
import { cn } from "@/lib/utils";

// Keys made from the stops' text, so the camera and routes only move when a
// stop does: a refresh of the same moments keeps the map where it is.
const keyOf = (points: MapPoint[]) => points.map((p) => `${p.momentId}:${p.stopIndex}:${p.lng},${p.lat}`).join(";");
const lineOf = (points: MapPoint[]) => points.map((p): [number, number] => [p.lng, p.lat]);

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The experience's stops on a map: numbered in time order and joined by a
// dashed route. Clicking a marker selects its moment; a moment selected
// elsewhere flies the map to its stops.
export function ItineraryMap({
  moments,
  selectedMomentId,
  onSelectMoment,
}: {
  moments: MomentView[];
  selectedMomentId?: string;
  onSelectMoment: (momentId: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  // MapLibre needs the browser, so nothing draws until this has mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const points = useMemo(() => mapPoints(moments), [moments]);
  const pointsKey = keyOf(points);
  const line = useMemo(() => lineOf(points), [pointsKey]);
  const picked = points.filter((p) => p.momentId === selectedMomentId);
  const pickedKey = keyOf(picked);
  const pickedLine = useMemo(() => lineOf(picked), [pickedKey]);

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No places on the map yet. Photos with GPS, or a place picked while adding, put a stop here.
      </div>
    );
  }
  if (!mounted) return <div aria-hidden className="h-[28rem] rounded-lg border" />;

  // The app's theme. Until next-themes knows it, mapcn reads the page's own.
  const theme = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : undefined;
  return (
    <MapView theme={theme} className="h-[28rem] overflow-hidden rounded-lg border">
      <Camera points={points} pointsKey={pointsKey} selectedMomentId={selectedMomentId} />
      <MapRoute
        id="itinerary-route"
        coordinates={line}
        color={theme === "dark" ? "#d6d3d1" : "#57534e"}
        width={2}
        opacity={0.9}
        dashArray={[2, 2]}
        interactive={false}
      />
      {pickedLine.length > 1 && (
        <MapRoute id="moment-route" coordinates={pickedLine} color="#f59e0b" width={4} interactive={false} />
      )}
      {points.map((p, i) => {
        const name = p.place ?? "Stop";
        const selected = p.momentId === selectedMomentId;
        return (
          <MapMarker key={`${p.momentId}:${p.stopIndex}`} longitude={p.lng} latitude={p.lat} onClick={() => onSelectMoment(p.momentId)}>
            <MarkerContent>
              {/* A button, so the markers can be reached from the keyboard. */}
              <button
                type="button"
                aria-label={`${i + 1}. ${name}`}
                className={cn(
                  "grid size-6 place-items-center rounded-full border-2 border-background bg-foreground text-[11px] leading-none font-semibold text-background shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // Amber for the selected moment's stops, as the story marks its active stop.
                  selected && "size-7 bg-amber-300 text-stone-950 ring-4 ring-amber-300/40",
                )}
              >
                {i + 1}
              </button>
            </MarkerContent>
            <MarkerTooltip>
              <span className="block font-medium">{name}</span>
              {p.startsAt !== undefined && <span className="block opacity-70">{when(p.startsAt)}</span>}
            </MarkerTooltip>
          </MapMarker>
        );
      })}
      <MapControls />
    </MapView>
  );
}

// Frames every stop whenever they change, and a moment's own stops when it is
// picked. The last framing is remembered, because a theme change reloads the
// basemap and that must not reset the view.
function Camera({ points, pointsKey, selectedMomentId }: { points: MapPoint[]; pointsKey: string; selectedMomentId?: string }) {
  const { map, isLoaded } = useMap();
  const framed = useRef<string | null>(null);
  const flown = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded || !map || framed.current === pointsKey) return;
    framed.current = pointsKey;
    const box = bounds(points);
    if (box) map.fitBounds(box, { padding: 40, maxZoom: 14, animate: false });
  }, [isLoaded, map, points, pointsKey]);

  useEffect(() => {
    if (!isLoaded || !map || flown.current === selectedMomentId) return;
    flown.current = selectedMomentId;
    const stops = points.filter((p) => p.momentId === selectedMomentId);
    const box = bounds(stops);
    // A moment with no places on the map leaves the view where it is.
    if (!box) return;
    if (stops.length === 1) map.flyTo({ center: box[0], zoom: Math.min(14, Math.max(12, map.getZoom())), duration: 800 });
    else map.fitBounds(box, { padding: 40, maxZoom: 14, duration: 800 });
  }, [isLoaded, map, points, selectedMomentId]);

  return null;
}
