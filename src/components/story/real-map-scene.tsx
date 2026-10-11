import { LngLatBounds } from "maplibre-gl";
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
import { legDuration } from "@/lib/story-map";
import type { LatLng, StoryStep } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

type Leg = Extract<StoryStep, { kind: "travel" }>;
type Point = [number, number];

const lngLat = (g: LatLng): Point => [g.lng, g.lat];
// Planes arc high; everything else bends a little, as on the drawn map.
const bend = (transport: string) => (transport === "plane" ? 0.3 : 0.08);
// How long a leg in view waits for the basemap before showing the drawn map.
const LOAD_TIMEOUT_MS = 6000;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const PAST = { "line-color": "#e7e5e4", "line-opacity": 0.3, "line-width": 1.5, "line-dasharray": [2, 2] };

// The same bow MapArc draws, so the leg on its way matches the ones behind
// it: a quadratic curve, the far end unwrapped to cross the shorter way.
function curve(from: Point, to: Point, k: number, samples = 64): Point[] {
  const [x0, y0] = from;
  const x2 = to[0] - from[0] > 180 ? to[0] - 360 : to[0] - from[0] < -180 ? to[0] + 360 : to[0];
  const y2 = to[1];
  const d = Math.hypot(x2 - x0, y2 - y0);
  if (d === 0) return [from, [x2, y2]];
  const cx = (x0 + x2) / 2 - ((y2 - y0) / d) * d * k;
  const cy = (y0 + y2) / 2 + ((x2 - x0) / d) * d * k;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2];
  });
}

// A leg on a real map, live-tracker style: the camera starts on where they
// left from and pulls back to show both ends while the route draws itself
// and the transport crosses it, over the same time the drawn map takes.
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
  from: LatLng;
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
  const [progress, setProgress] = useState(animate ? 0 : 1);
  const [loaded, setLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const route = useMemo(
    () => curve([from.lng, from.lat], [to.lng, to.lat], bend(leg.transport)),
    [from.lng, from.lat, to.lng, to.lat, leg.transport],
  );
  const behind = useMemo(() => {
    const done = legs.slice(0, current).flatMap((l, id) =>
      l.fromGeo && l.toGeo ? [{ id, from: lngLat(l.fromGeo), to: lngLat(l.toGeo), plane: l.transport === "plane" }] : [],
    );
    return { flown: done.filter((l) => l.plane), went: done.filter((l) => !l.plane) };
  }, [legs, current]);
  const visited = new Set(legs.slice(0, current + 1).flatMap((l) => [l.from, l.to]));

  useEffect(() => {
    if (!animate || !active) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / (seconds * 1000));
      setProgress(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, active, seconds]);

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
        <RealMap theme="dark" interactive={false} center={lngLat(from)} zoom={11}>
          <Loaded onLoad={setLoaded} />
          <Camera from={from} to={to} route={route} seconds={seconds} animate={animate} active={active} />
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
          <MapRoute coordinates={route} color="#e7e5e4" opacity={0.3} width={2} dashArray={[1, 2]} progress={progress} interactive={false}>
            <RouteProgress color="#fde68a" opacity={1} width={4} />
            <RouteMarker at="progress">
              <MarkerContent>
                <span className="grid size-9 place-items-center rounded-full border-2 border-[#c2410c] bg-[#f3e9d6] shadow-lg">
                  {Icon && <Icon aria-hidden className="size-4 text-[#c2410c]" />}
                </span>
              </MarkerContent>
            </RouteMarker>
          </MapRoute>
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

function Loaded({ onLoad }: { onLoad: (loaded: boolean) => void }) {
  const { isLoaded } = useMap();
  useEffect(() => {
    if (isLoaded) onLoad(true);
  }, [isLoaded, onLoad]);
  return null;
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
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const bounds = route.reduce((b, p) => b.extend(p), new LngLatBounds(route[0], route[0]));
    // Labels hang up to ~110px either side of a point, so the sides keep at
    // least that much room on narrow phones.
    const side = Math.max(w * 0.14, 110);
    const fit = { padding: { top: h * 0.3, bottom: h * 0.14, left: side, right: side }, maxZoom: 13 };
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
