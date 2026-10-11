// The geometry of resizing and turning a piece with the mouse. A piece is a
// box turned about its middle; its position is the top-left of the unturned
// box in its parent's space (parents are never turned or scaled).

export type Box = { x: number; y: number; w: number; h: number; rotation: number };

// Which side or corner is held: -1 left/top, 1 right/bottom, 0 not that way.
export type Handle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 };

export const HANDLES: Handle[] = [
  { hx: -1, hy: -1 },
  { hx: 0, hy: -1 },
  { hx: 1, hy: -1 },
  { hx: 1, hy: 0 },
  { hx: 1, hy: 1 },
  { hx: 0, hy: 1 },
  { hx: -1, hy: 1 },
  { hx: -1, hy: 0 },
];

export const MIN_PIECE = 12;

const rad = (deg: number) => (deg * Math.PI) / 180;

// The box after dragging `handle` by (dx, dy) in the parent's space. The side
// opposite the handle stays where it is, however the piece is turned. With
// `keepRatio`, a corner keeps the shape.
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, keepRatio = false, min = MIN_PIECE): Box {
  const cos = Math.cos(rad(box.rotation));
  const sin = Math.sin(rad(box.rotation));
  // The drag along the piece's own axes.
  const ldx = dx * cos + dy * sin;
  const ldy = -dx * sin + dy * cos;
  let w = box.w + handle.hx * ldx;
  let h = box.h + handle.hy * ldy;
  if (keepRatio && handle.hx !== 0 && handle.hy !== 0) {
    const scale = Math.max(w / box.w, h / box.h);
    w = box.w * scale;
    h = box.h * scale;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  // Where the middle moves to: half of what each held side moved.
  const shiftX = (handle.hx * (w - box.w)) / 2;
  const shiftY = (handle.hy * (h - box.h)) / 2;
  const cx = box.x + box.w / 2 + (cos * shiftX - sin * shiftY);
  const cy = box.y + box.h / 2 + (sin * shiftX + cos * shiftY);
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotation: box.rotation };
}

// The angle, in degrees from -180 to 180, to turn a piece to so its top points
// at `to`, given its middle. Snaps to `step` degrees when asked.
export function turnTo(center: { x: number; y: number }, to: { x: number; y: number }, step?: number): number {
  const deg = (Math.atan2(to.y - center.y, to.x - center.x) * 180) / Math.PI + 90;
  const snapped = step === undefined ? deg : Math.round(deg / step) * step;
  return normalize(snapped);
}

export function normalize(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Object.is(d, -0) ? 0 : d;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
