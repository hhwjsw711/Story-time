import { LngLatBounds, type Map as MapLibre } from "maplibre-gl";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { transportOf } from "@/components/event/transport";
import {
  MapArc,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  Map as RealMap,
  RouteMarker,
  RouteProgress,
  useMap,
} from "@/components/ui/map";
import { bend, curve, ease } from "@/lib/map-route";
import { legDuration } from "@/lib/story-map";
import type { LatLng, StoryStep } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

type Leg = Extract<StoryStep, { kind: "travel" }>;
type Point = [number, number];

const lngLat = (g: LatLng): Point => [g.lng, g.lat];
// How long a leg in view waits for the basemap before showing the drawn map.
const LOAD_TIMEOUT_MS = 6000;
const PAST = { "line-color": "#e7e5e4", "line-opacity": 0.3, "line-width": 1.5, "line-dasharray": [2, 2] };
// Where an arrival comes to rest, close enough to read the streets.
const ARRIVE_ZOOM = 12.5;
// Where an arrival opens when it is the only place on the map.
const LONE_ZOOM = 5;

// A leg on a real map, live-tracker style: the camera starts on where they
// left from and pulls back to show both ends while the route draws itself
// and the transport crosses it, over the same time the drawn map takes.
// A leg with no spot to set off from arrives instead: the camera opens wide
// on every place and flies in on the destination, where the transport parks.
// Earlier legs stay faint; every located place of the story is marked.
// Mounted ahead of view, it waits on the departure until `active`.
export function RealMapScene({
  leg,
  from,
  to,
  legs,
  current,
  places,
  animate,
  active,
  fallback,
}: {
  leg: Leg;
  // Where the leg sets off from, when that place is on the map.
  from?: LatLng;
  to: LatLng;
  legs: Leg[];
  current: number;
  places: Array<{ name: string; geo: LatLng }>;
  animate: boolean;
  active: boolean;
  // Shown instead when the basemap doesn't arrive (tiles blocked, offline).
  fallback: ReactNode;
}) {
  const seconds = legDuration(leg.transport);
  const transport = transportOf(leg.transport);
  const Icon = transport?.icon;
  const departs = from !== undefined;
  const [progress, setProgress] = useState(animate ? 0 : 1);
  const [loaded, setLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  // An arrival has no route: nothing to draw from.
  const route = useMemo(
    () => (from ? curve(lngLat(from), lngLat(to), bend(leg.transport)) : []),
    [from?.lng, from?.lat, to.lng, to.lat, leg.transport],
  );
  const behind = useMemo(() => {
    const done = legs.slice(0, current).flatMap((l, id) =>
      l.fromGeo && l.toGeo ? [{ id, from: lngLat(l.fromGeo), to: lngLat(l.toGeo), plane: l.transport === "plane" }] : [],
    );
    return { flown: done.filter((l) => l.plane), went: done.filter((l) => !l.plane) };
  }, [legs, current]);
  const visited = useMemo(() => new Set(legs.slice(0, current + 1).flatMap((l) => [l.from, l.to])), [legs, current]);

  useEffect(() => {
    if (!departs || !animate || !active) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / (seconds * 1000));
      setProgress(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [departs, animate, active, seconds]);

  // Timed only while in view: a scene mounted ahead may load at leisure.
  useEffect(() => {
    if (loaded || !active) return;
    const t = setTimeout(() => setGaveUp(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loaded, active]);

  if (gaveUp && !loaded) return fallback;

  return (
    <section aria-label={`${transport?.phrase ?? "Travelling"} from ${leg.from} to ${leg.to}`} className="relative flex-1">
      {/* Full bleed, up under the header; it fades in once the basemap is drawn. */}
      <div className={cn("absolute inset-x-0 -top-12 bottom-0 transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0")}>
        <RealMap theme="dark" interactive={false} center={lngLat(from ?? to)} zoom={11}>
          <Loaded onLoad={setLoaded} />
          {from ? (
            <Camera from={from} to={to} route={route} seconds={seconds} animate={animate} active={active} />
          ) : (
            <Arrival to={to} places={places} seconds={seconds} animate={animate} active={active} />
          )}
          <MapArc id="flown" data={behind.flown} curvature={bend("plane")} paint={PAST} interactive={false} />
          <MapArc id="went" data={behind.went} curvature={bend("walk")} paint={PAST} interactive={false} />
          {places.map((p) => {
            const active = p.name === leg.to;
            return (
              <MapMarker key={p.name} longitude={p.geo.lng} latitude={p.geo.lat}>
                <MarkerContent>
                  <span
                    className={cn(
                      "block rounded-full border",
                      active ? "size-3 border-[#c2410c] bg-amber-200" : "size-2 border-stone-900 bg-stone-300",
                      !active && !visited.has(p.name) && "opacity-50",
                    )}
                  />
                  <MarkerLabel
                    position="bottom"
                    className={cn(
                      "max-w-40 truncate font-serif text-xs text-stone-300 [text-shadow:0_1px_3px_#141210]",
                      // Clear of the transport, which parks here.
                      active && "mt-5 max-w-52 text-sm font-semibold text-amber-200",
                    )}
                  >
                    {p.name}
                  </MarkerLabel>
                </MarkerContent>
              </MapMarker>
            );
          })}
          {from ? (
            <MapRoute coordinates={route} color="#e7e5e4" opacity={0.3} width={2} dashArray={[1, 2]} progress={progress} interactive={false}>
              <RouteProgress color="#fde68a" opacity={1} width={4} />
              <RouteMarker at="progress">
                <MarkerContent>
                  <Badge Icon={Icon} />
                </MarkerContent>
              </RouteMarker>
            </MapRoute>
          ) : (
            <MapMarker longitude={to.lng} latitude={to.lat}>
              <MarkerContent>
                <Badge Icon={Icon} pulse={animate} />
              </MarkerContent>
            </MapMarker>
          )}
          {/* The edges fade into the stage, darkest at the top behind the
              header and caption; the attribution stays above it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_45%,#141210_100%),linear-gradient(to_bottom,#141210_0%,rgb(20_18_16/0.7)_18%,transparent_40%,transparent_85%,#141210_100%)]"
          />
        </RealMap>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 px-4 pt-2 text-center [text-shadow:0_1px_6px_#141210]">
        <p className="text-xs tracking-[0.25em] text-amber-200/90 uppercase">
          {Icon && <Icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />}
          {transport?.phrase}
        </p>
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {leg.from} <span aria-hidden className="text-white/50">→</span> {leg.to}
        </h2>
      </div>
    </section>
  );
}

// The transport, riding the route or parked on an arrival. Its halo pulses
// gently while the scene plays.
function Badge({ Icon, pulse = false }: { Icon?: LucideIcon; pulse?: boolean }) {
  return (
    <span className="relative grid size-9 place-items-center">
      {pulse && <span aria-hidden className="absolute -inset-1.5 animate-pulse rounded-full border-2 border-[#c2410c]/40" />}
      <span className="grid size-9 place-items-center rounded-full border-2 border-[#c2410c] bg-[#f3e9d6] shadow-lg">
        {Icon && <Icon aria-hidden className="size-4 text-[#c2410c]" />}
      </span>
    </span>
  );
}

function Loaded({ onLoad }: { onLoad: (loaded: boolean) => void }) {
  const { isLoaded } = useMap();
  useEffect(() => {
    if (isLoaded) onLoad(true);
  }, [isLoaded, onLoad]);
  return null;
}

// Room for the caption over the top of the map. The sides keep clear of
// labels, which hang up to ~110px either side of a point on narrow phones.
function framePadding(map: MapLibre) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const side = Math.max(w * 0.14, 110);
  return { top: h * 0.3, bottom: h * 0.14, left: side, right: side };
}

// Starts close on the departure, then (once active) eases out to frame both
// ends below the caption. Two spots in the same place just centre at street
// level.
function Camera({
  from,
  to,
  route,
  seconds,
  animate,
  active,
}: {
  from: LatLng;
  to: LatLng;
  route: Point[];
  seconds: number;
  animate: boolean;
  active: boolean;
}) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const bounds = route.reduce((b, p) => b.extend(p), new LngLatBounds(route[0], route[0]));
    const fit = { padding: framePadding(map), maxZoom: 13 };
    if (!animate) {
      map.fitBounds(bounds, { ...fit, duration: 0 });
      return;
    }
    const zoom = map.cameraForBounds(bounds, fit)?.zoom ?? 10;
    map.jumpTo({ center: [from.lng, from.lat], zoom: Math.min(zoom + 2, 14) });
    if (active) map.fitBounds(bounds, { ...fit, duration: Math.min(2500, seconds * 700), essential: true });
    // Keyed on the leg's ends, not their objects, so a data refresh doesn't restart it.
  }, [map, from.lat, from.lng, to.lat, to.lng, animate, active]);
  return null;
}

// Only the destination is known, so the camera opens wide on every place of
// the story, then (once active) flies in on the destination over the leg's
// time. Without motion it goes straight to the destination.
function Arrival({
  to,
  places,
  seconds,
  animate,
  active,
}: {
  to: LatLng;
  places: Array<{ name: string; geo: LatLng }>;
  seconds: number;
  animate: boolean;
  active: boolean;
}) {
  const { map } = useMap();
  // Keyed on the spots, not their objects, so a data refresh doesn't restart it.
  const spots = places.map((p) => `${p.geo.lng},${p.geo.lat}`).join(";");
  useEffect(() => {
    if (!map) return;
    const destination = lngLat(to);
    const padding = framePadding(map);
    if (!animate) {
      map.jumpTo({ center: destination, zoom: ARRIVE_ZOOM, padding });
      return;
    }
    const points = places.map((p) => lngLat(p.geo));
    if (points.length > 1) {
      const box = points.reduce((b, p) => b.extend(p), new LngLatBounds(points[0], points[0]));
      map.fitBounds(box, { padding, maxZoom: 10, duration: 0 });
    } else {
      map.jumpTo({ center: destination, zoom: LONE_ZOOM, padding });
    }
    if (active) map.flyTo({ center: destination, zoom: ARRIVE_ZOOM, padding, duration: seconds * 1000, essential: true });
  }, [map, to.lat, to.lng, spots, seconds, animate, active]);
  return null;
}
