// The camera over an infinite canvas. `x` and `y` are the world point at the
// viewport's top-left corner, and `zoom` is screen pixels per world unit, so a
// world point shows at ((wx - x) * zoom, (wy - y) * zoom).

export type Camera = { x: number; y: number; zoom: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export const toWorld = (c: Camera, sx: number, sy: number) => ({ x: sx / c.zoom + c.x, y: sy / c.zoom + c.y });
export const toScreen = (c: Camera, wx: number, wy: number) => ({ x: (wx - c.x) * c.zoom, y: (wy - c.y) * c.zoom });

// Zooms by `factor` around a screen point, which stays where it is.
export function zoomAt(c: Camera, factor: number, sx: number, sy: number): Camera {
  const zoom = clampZoom(c.zoom * factor);
  const at = toWorld(c, sx, sy);
  return { zoom, x: at.x - sx / zoom, y: at.y - sy / zoom };
}

// Drags the canvas by a screen distance.
export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x - dx / c.zoom, y: c.y - dy / c.zoom };
}

// The world point at the middle of the viewport.
export function centerOf(c: Camera, view: Size) {
  return { x: c.x + view.w / c.zoom / 2, y: c.y + view.h / c.zoom / 2 };
}

function centered(cx: number, cy: number, zoom: number, view: Size): Camera {
  return { zoom, x: cx - view.w / zoom / 2, y: cy - view.h / zoom / 2 };
}

// A camera that shows `r` in the middle of the viewport with `padding` (a
// fraction of the viewport) around it, never closer than `maxZoom`.
export function fitRect(r: Rect, view: Size, padding = 0.08, maxZoom = 1.5): Camera {
  const room = 1 - 2 * padding;
  const zoom = clampZoom(Math.min((view.w * room) / Math.max(r.w, 1), (view.h * room) / Math.max(r.h, 1), maxZoom));
  return centered(r.x + r.w / 2, r.y + r.h / 2, zoom, view);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// A path from one camera to another that backs out before it goes in, further
// the longer the trip, so moving between frames reads as zooming out of one
// and into the next. `t` runs from 0 (at `a`) to 1 (at `b`).
export function flight(a: Camera, b: Camera, view: Size): (t: number) => Camera {
  const from = centerOf(a, view);
  const to = centerOf(b, view);
  const reach = Math.hypot(to.x - from.x, to.y - from.y) * Math.min(a.zoom, b.zoom);
  const lift = Math.min(1.6, Math.log2(1 + reach / Math.max(view.w, view.h)));
  const lnA = Math.log(a.zoom);
  const lnB = Math.log(b.zoom);
  return (t) => {
    const e = smooth(Math.min(1, Math.max(0, t)));
    const zoom = clampZoom(Math.exp(lnA + (lnB - lnA) * e - lift * Math.sin(Math.PI * t)));
    return centered(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, zoom, view);
  };
}
