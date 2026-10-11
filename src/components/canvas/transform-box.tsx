import type { PointerEvent } from "react";
import { type Handle, HANDLES } from "@/lib/canvas/transform";

// The frame around a selected piece, with handles to size and turn it. The
// handles stay the same size on screen at any zoom.

const BLUE = "#2f6df6";
const px = (n: number) => `calc(${n}px / var(--zoom))`;

type Props = {
  box: { x: number; y: number; w: number; h: number; rotation: number };
  // Sides can be dragged, and the piece can be turned.
  resizable: boolean;
  turnable: boolean;
  onHandle: (handle: Handle, e: PointerEvent) => void;
  onTurn: (e: PointerEvent) => void;
};

export function TransformBox({ box, resizable, turnable, onHandle, onTurn }: Props) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        transform: box.rotation === 0 ? undefined : `rotate(${box.rotation}deg)`,
        outline: `${px(1.5)} solid ${BLUE}`,
      }}
    >
      {resizable &&
        HANDLES.map((h) => (
          <div
            key={`${h.hx},${h.hy}`}
            className="pointer-events-auto absolute bg-white"
            style={{
              left: `${(h.hx + 1) * 50}%`,
              top: `${(h.hy + 1) * 50}%`,
              width: px(10),
              height: px(10),
              marginLeft: px(-5),
              marginTop: px(-5),
              border: `${px(1.5)} solid ${BLUE}`,
              cursor: cursorFor(h, box.rotation),
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHandle(h, e);
            }}
          />
        ))}
      {turnable && (
        <>
          <div className="absolute left-1/2" style={{ top: px(-22), height: px(22), width: px(1.5), background: BLUE, marginLeft: px(-0.75) }} />
          <div
            className="pointer-events-auto absolute left-1/2 rounded-full bg-white"
            style={{ top: px(-32), width: px(12), height: px(12), marginLeft: px(-6), border: `${px(1.5)} solid ${BLUE}`, cursor: "grab" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onTurn(e);
            }}
          />
        </>
      )}
    </div>
  );
}

// The arrow that points along the handle's side, as the piece is turned.
function cursorFor(h: Handle, rotation: number): string {
  const base = h.hy === 0 ? 0 : h.hx === 0 ? 90 : h.hx === h.hy ? 45 : 135;
  const turned = (((base + rotation) % 180) + 180) % 180;
  if (turned < 22.5 || turned >= 157.5) return "ew-resize";
  if (turned < 67.5) return "nwse-resize";
  if (turned < 112.5) return "ns-resize";
  return "nesw-resize";
}
