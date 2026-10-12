import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import type { MomentView } from "@/components/event/types";
import { tapedTo } from "./add";
import { placeOf } from "./elements";
import { FONTS } from "./look";
import { JournalPage, type PageData } from "./page";

// One page, editable: press a thing to pick it up, drag it, pull its corners
// to size it, turn it by the round handle. Edges and middles snap to the page
// and to each other. Double-click words to write. Nothing changes the saved
// page until a gesture ends.

const KEEP_RATIO = new Set<JournalElement["kind"]>(["photo", "sticker"]);
const WRITABLE = new Set<JournalElement["kind"]>(["title", "note"]);

export const writable = (e: JournalElement) => WRITABLE.has(e.kind) || (e.kind === "deco" && (e.style === "ticket" || e.style === "postmark")) || (e.kind === "photo" && (e.style ?? "polaroid") === "polaroid");

export function PageEditor({
  page,
  moments,
  scale,
  editable,
  selected,
  writing,
  onSelect,
  onWrite,
  onChange,
}: {
  page: PageData;
  moments: ReadonlyMap<string, MomentView>;
  scale: number;
  editable: boolean;
  selected: string | null;
  // The element whose words are open for writing.
  writing: string | null;
  onSelect: (id: string | null) => void;
  onWrite: (id: string | null) => void;
  onChange: (elements: JournalElement[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const moveable = useRef<Moveable>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const chosen = page.elements.find((e) => e.id === selected);
  const elements = useRef(page.elements);
  elements.current = page.elements;

  // The DOM node of what is selected, once it is drawn.
  useEffect(() => {
    const el = selected ? root.current?.querySelector<HTMLElement>(`[data-el="${CSS.escape(selected)}"]`) : null;
    setTarget(el ?? null);
  }, [selected, page]);

  const others = useMemo(
    () => (root.current ? [...root.current.querySelectorAll<HTMLElement>("[data-el]")].filter((n) => n.dataset.el !== selected) : []),
    // Recomputed when the page or the selection changes.
    [page, selected, target],
  );

  const update = (id: string, change: Partial<JournalElement>) =>
    onChange(elements.current.map((e) => (e.id === id ? { ...e, ...change } : e)));

  // Pressing a thing picks it up and starts a drag in the same gesture.
  const press = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || writing) return;
    const node = (ev.target as HTMLElement).closest<HTMLElement>("[data-el]");
    if ((ev.target as HTMLElement).closest("[data-no-drag]")) return;
    const id = node?.dataset.el ?? null;
    const e = page.elements.find((x) => x.id === id);
    if (id === null || e === undefined) {
      onSelect(null);
      return;
    }
    if (id !== selected) {
      onSelect(id);
      if (!e.locked) {
        const native = ev.nativeEvent;
        void moveable.current?.waitToChangeTarget().then(() => moveable.current?.dragStart(native));
      }
    }
  };

  const doublePress = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-el]")?.dataset.el;
    const e = page.elements.find((x) => x.id === id);
    if (e && writable(e) && !e.locked) onWrite(e.id);
  };

  const locked = chosen?.locked ?? false;

  return (
    <div onPointerDown={press} onDoubleClick={doublePress} className="relative">
      <JournalPage ref={root} page={page} moments={moments} scale={scale}>
        {editable && writing && <WordsBox e={page.elements.find((e) => e.id === writing)} onDone={(text) => {
          if (text !== null) update(writing, { text });
          onWrite(null);
        }} />}
        {editable && target && chosen && !writing && (
          <Moveable
            ref={moveable}
            target={target}
            zoom={1 / scale}
            origin={false}
            draggable={!locked}
            resizable={!locked}
            rotatable={!locked}
            keepRatio={KEEP_RATIO.has(chosen.kind)}
            throttleRotate={1}
            rotationPosition="top"
            renderDirections={locked ? [] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
            snappable
            snapThreshold={8}
            snapGap={false}
            isDisplaySnapDigit={false}
            elementGuidelines={others}
            verticalGuidelines={[0, PAGE.w / 2, PAGE.w]}
            horizontalGuidelines={[0, PAGE.h / 2, PAGE.h]}
            snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            onDrag={({ target: t, beforeTranslate }) => {
              const [x, y] = [beforeTranslate[0]!, beforeTranslate[1]!];
              t.style.transform = placeOf({ x, y, rotation: chosen.rotation });
              // Its tape comes along.
              for (const tape of tapedTo(chosen, elements.current)) {
                const node = root.current?.querySelector<HTMLElement>(`[data-el="${CSS.escape(tape.id)}"]`);
                if (node) node.style.transform = placeOf({ x: tape.x + x - chosen.x, y: tape.y + y - chosen.y, rotation: tape.rotation });
              }
            }}
            onDragEnd={({ lastEvent }) => {
              if (!lastEvent) return;
              const dx = Math.round(lastEvent.beforeTranslate[0]!) - chosen.x;
              const dy = Math.round(lastEvent.beforeTranslate[1]!) - chosen.y;
              const moving = new Set([chosen.id, ...tapedTo(chosen, elements.current).map((t) => t.id)]);
              onChange(elements.current.map((e) => (moving.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)));
            }}
            onResizeStart={({ setOrigin, dragStart }) => {
              setOrigin(["%", "%"]);
              if (dragStart) dragStart.set([chosen.x, chosen.y]);
            }}
            onResize={({ target: t, width, height, drag }) => {
              t.style.width = `${width}px`;
              t.style.height = `${height}px`;
              t.style.transform = placeOf({ x: drag.beforeTranslate[0]!, y: drag.beforeTranslate[1]!, rotation: chosen.rotation });
            }}
            onResizeEnd={({ lastEvent }) => {
              if (!lastEvent) return;
              update(chosen.id, {
                w: Math.max(8, Math.round(lastEvent.width)),
                h: Math.max(8, Math.round(lastEvent.height)),
                x: Math.round(lastEvent.drag.beforeTranslate[0]!),
                y: Math.round(lastEvent.drag.beforeTranslate[1]!),
              });
            }}
            onDragStart={({ set }) => set([chosen.x, chosen.y])}
            onRotateStart={({ set }) => set(chosen.rotation)}
            onRotate={({ target: t, rotation }) => {
              t.style.transform = placeOf({ x: chosen.x, y: chosen.y, rotation });
            }}
            onRotateEnd={({ lastEvent }) => {
              if (lastEvent) update(chosen.id, { rotation: Math.round(lastEvent.rotation) % 360 });
            }}
          />
        )}
      </JournalPage>
    </div>
  );
}

// Writing on a thing: a text box over it, in its place and turn. Enter keeps a
// title; a note keeps its new lines until you click away. Escape leaves it as it was.
function WordsBox({ e, onDone }: { e: JournalElement | undefined; onDone: (text: string | null) => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(e?.text ?? "");
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  if (e === undefined) return null;
  const multiline = e.kind === "note";
  return (
    <textarea
      ref={box}
      value={text}
      aria-label="Words"
      maxLength={1000}
      onChange={(ev) => setText(ev.target.value)}
      onPointerDown={(ev) => ev.stopPropagation()}
      onBlur={() => onDone(text)}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          onDone(null);
        } else if (ev.key === "Enter" && (!multiline || ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault();
          onDone(text);
        }
      }}
      className="absolute resize-none rounded-md border-2 border-[#c4552f] bg-[#fffdf6]/95 p-3 text-[#1f1a16] shadow-xl outline-none"
      style={{
        left: 0,
        top: 0,
        width: Math.max(e.w, 280),
        height: Math.max(e.h, multiline ? 200 : 90),
        transform: placeOf(e),
        zIndex: 100000,
        fontFamily: multiline ? FONTS.typewriter : FONTS.caslon,
        fontSize: multiline ? 22 : 34,
        lineHeight: 1.3,
      }}
    />
  );
}
