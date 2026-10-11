import { useEffect, useState } from "react";
import { fetchPath, wantsPath, type Path } from "@/lib/road-path";
import type { LatLng, Transport } from "@/lib/story-steps";

// How long a scene waits for a route before it settles for the arc. A scene is
// mounted ahead of view, so the route is normally there before it is seen.
const WAIT_MS = 2500;

// The path a leg follows on the roads or rails, or nothing when it has none to
// follow (a plane, a hop on the spot, no router, too slow). `settled` says the
// answer is final for this leg: until then a scene holds back its animation, so
// it never starts along an arc and bends onto a street halfway. A route that
// turns up after the wait is kept for the next time, not swapped in.
export function useRoutePath(
  from: LatLng | undefined,
  to: LatLng | undefined,
  transport: Transport,
): { path: Path | undefined; settled: boolean } {
  const [fromLat, fromLng, toLat, toLng] = [from?.lat, from?.lng, to?.lat, to?.lng];
  const wanted =
    fromLat !== undefined &&
    fromLng !== undefined &&
    toLat !== undefined &&
    toLng !== undefined &&
    wantsPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, transport);
  const key = wanted ? `${transport}:${fromLat},${fromLng};${toLat},${toLng}` : "";
  const [done, setDone] = useState<{ key: string; path: Path | undefined } | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // The first answer for a leg is the one kept, whether it is the route or the wait running out.
    const settle = (path: Path | undefined) => {
      if (live) setDone((prev) => (prev?.key === key ? prev : { key, path }));
    };
    const timer = setTimeout(() => settle(undefined), WAIT_MS);
    void fetchPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, transport).then((path) => {
      clearTimeout(timer);
      settle(path);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, wanted, fromLat, fromLng, toLat, toLng, transport]);

  if (!wanted) return { path: undefined, settled: true };
  return done?.key === key ? { path: done.path, settled: true } : { path: undefined, settled: false };
}
