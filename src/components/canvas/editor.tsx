import { useQuery } from "convex/react";
import { MaximizeIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, Redo2Icon, SkipBackIcon, SkipForwardIcon, Undo2Icon, XIcon } from "lucide-react";
import { type DragEvent, type KeyboardEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { type Camera, centerOf, fitRect, flight, type Size, toWorld, zoomAt } from "@/lib/canvas/camera";
import { errorMessage } from "@/lib/errors";
import { copiesOf, newFrame, newMoment, newPhoto, newScrap, newTape, newTitle, type NewNode, piecesOfMoment } from "@/lib/canvas/make";
import { DESK, frameLook } from "@/lib/canvas/look";
import {
  type Change,
  flowOf,
  frameAt,
  holdsLetters,
  indexNodes,
  nextZ,
  type Node,
  originOf,
  pick,
  union,
  withChange,
  withDescendants,
  worldRect,
} from "@/lib/canvas/model";
import { type Box, type Handle, normalize, resizeBox, round1, turnTo } from "@/lib/canvas/transform";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";
import { NodeTree } from "./node-tree";
import { DRAG_TYPE, type Item, Tray } from "./tray";
import { TransformBox } from "./transform-box";
import { useCanvas } from "./use-canvas";

type NodeId = Id<"canvasNodes">;
type Pt = { x: number; y: number };

type Gesture =
  | { kind: "move"; ids: NodeId[]; start: Pt; origin: Map<NodeId, Pt>; moved: boolean }
  | { kind: "resize"; id: NodeId; handle: Handle; start: Pt; box: Box; ratio: boolean }
  | { kind: "turn"; id: NodeId; center: Pt };

const TURNS = new Set<Node["kind"]>(["moment", "photo", "scrap", "tape", "letter"]);
const typing = (e: { target: EventTarget }) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The collage canvas of an experience: frames and pieces laid out over its
// moments and photos, edited a piece at a time, and played back as a flow that
// zooms from frame to frame. Anyone who can see the experience can look and
// play it; only its owner edits.
export function CanvasEditor({ event }: { event: EventView }) {
  const canvas = useCanvas(event._id);
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const momentById = useMemo(() => new Map((moments ?? []).map((m) => [m._id as string, m])), [moments]);
  const canEdit = canvas.canEdit;

  const [camera, setCamera] = useState<Camera>({ x: -100, y: -100, zoom: 0.5 });
  const [view, setView] = useState<Size>({ w: 800, h: 600 });
  const [selected, setSelected] = useState<NodeId[]>([]);
  const [scope, setScope] = useState<NodeId | undefined>();
  // Where things are while they are being dragged, before they are saved.
  const [live, setLive] = useState<ReadonlyMap<NodeId, Change>>(new Map());
  // The flow: which frame it is on (-1 is the whole canvas), or null when it isn't playing.
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [focusWords, setFocusWords] = useState(0);

  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const viewRef = useRef(view);
  viewRef.current = view;
  const gesture = useRef<Gesture | null>(null);
  // What is being dragged right now, kept where the end of the gesture can read it.
  const dragging = useRef<ReadonlyMap<NodeId, Change>>(new Map());
  const raf = useRef(0);

  const shown = useMemo(
    () => (live.size === 0 ? canvas.nodes : canvas.nodes.map((n) => { const c = live.get(n._id); return c === undefined ? n : withChange(n, c); })),
    [canvas.nodes, live],
  );
  const tree = useMemo(() => indexNodes(shown), [shown]);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const flow = useMemo(() => flowOf(shown), [shown]);
  const selectedNodes = selected.flatMap((id) => tree.byId.get(id) ?? []);

  const fail = useCallback((e: unknown) => toast.error(errorMessage(e)), []);

  // ---- Where things are ----------------------------------------------------------

  const worldAt = useCallback((clientX: number, clientY: number): Pt => {
    const r = box.current?.getBoundingClientRect();
    return toWorld(cameraRef.current, clientX - (r?.left ?? 0), clientY - (r?.top ?? 0));
  }, []);

  const everything = useCallback((): Camera => {
    const all = union((treeRef.current.kids.get("") ?? []).map((n) => worldRect(n, treeRef.current.byId)));
    return fitRect(all ?? { x: 0, y: 0, w: 1400, h: 900 }, viewRef.current, 0.1, 1);
  }, []);

  // Open on the whole canvas the first time it loads.
  const fitted = useRef(false);
  useEffect(() => {
    if (!canvas.ready || fitted.current || view.w < 100) return;
    fitted.current = true;
    setCamera(everything());
  }, [canvas.ready, view, everything]);

  const moveCamera = useCallback((next: Camera) => {
    cancelAnimationFrame(raf.current);
    setCamera(next);
  }, []);

  // A flight to somewhere: out of where you are and into it.
  const fly = useCallback((to: Camera, ms = 1500) => {
    cancelAnimationFrame(raf.current);
    return new Promise<void>((resolve) => {
      if (reduced() || ms <= 0) {
        setCamera(to);
        resolve();
        return;
      }
      const path = flight(cameraRef.current, to, viewRef.current);
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        setCamera(path(t));
        if (t < 1) raf.current = requestAnimationFrame(tick);
        else resolve();
      };
      raf.current = requestAnimationFrame(tick);
    });
  }, []);

  const zoomBy = (factor: number) => moveCamera(zoomAt(camera, factor, view.w / 2, view.h / 2));
  const zoomToFrame = useCallback((node: Node) => void fly(fitRect(worldRect(node, treeRef.current.byId), viewRef.current, 0.08, 1.2), 900), [fly]);

  // ---- The flow --------------------------------------------------------------------

  const frameInFlow = at === null || at < 0 ? undefined : flow[at];
  useEffect(() => {
    if (at === null) return;
    const target = frameInFlow === undefined ? everything() : fitRect(worldRect(frameInFlow, treeRef.current.byId), viewRef.current, 0.05, 1.2);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void fly(target, frameInFlow === undefined ? 1100 : 1800).then(() => {
      if (!alive || !playing) return;
      timer = setTimeout(() => {
        if (at + 1 < flow.length) setAt(at + 1);
        else setPlaying(false);
      }, 3200);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // The flow plays from `at` and `playing`; the frames it plays are read when it gets there.
  }, [at, playing]);

  const startFlow = () => {
    setSelected([]);
    setScope(undefined);
    setAt(flow.length > 0 ? 0 : -1);
    setPlaying(flow.length > 1);
  };
  const stopFlow = () => {
    setAt(null);
    setPlaying(false);
    void fly(everything(), 900);
  };

  // ---- Adding ----------------------------------------------------------------------

  const select = (ids: NodeId[]) => {
    setSelected(ids);
    setScope(undefined);
  };

  // New frames go to the right of the last one, and the view goes with them.
  const addFrame = async (item: Extract<Item, { what: "frame" }>) => {
    const frames = (tree.kids.get("") ?? []).filter((n) => n.kind === "frame");
    const last = frames.reduce<Node | undefined>((far, f) => (far === undefined || f.x + f.w > far.x + far.w ? f : far), undefined);
    const centre = last === undefined ? centerOf(camera, view) : { x: last.x + last.w + 200, y: last.y + last.h / 2 };
    const order = flow.reduce((top, f) => Math.max(top, f.order ?? 0), 0) + 1;
    const [id] = await canvas.add([newFrame(item.size, item.look, order, centre, `Frame ${order}`)]);
    if (id === undefined) return;
    select([id]);
    // The camera moves once the frame is in the tree.
    setTimeout(() => {
      const f = treeRef.current.byId.get(id);
      if (f !== undefined) zoomToFrame(f);
    }, 120);
  };

  // Where a piece goes: into the frame under the point, else on the desk.
  const placeAt = useCallback((pt: Pt) => {
    const t = treeRef.current;
    const frame = frameAt(t, pt.x, pt.y);
    const o = frame === undefined ? { x: 0, y: 0 } : worldRect(frame, t.byId);
    return { x: pt.x - o.x, y: pt.y - o.y, parent: frame?._id };
  }, []);

  // Pieces added by a click go near the middle, each a little further along, so
  // they fan out instead of landing on top of each other.
  const spot = useRef(0);
  const nextSpot = (): Pt => {
    const k = (spot.current++ % 7) - 3;
    const c = centerOf(cameraRef.current, viewRef.current);
    return { x: c.x + (k * 40) / cameraRef.current.zoom, y: c.y + (k * 30) / cameraRef.current.zoom };
  };

  const momentOf = (id: string) => moments?.find((m) => m._id === id);
  const mediaOf = (id: string) =>
    moments?.flatMap((m) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat()).flatMap((b) => (b.type === "photo" && b.mediaId === id ? [b.mediaId] : []))[0];

  const addPiece = async (item: Item, pt: Pt) => {
    try {
      if (item.what === "frame") return void (await addFrame(item));
      const where = placeAt(pt);
      let specs: NewNode[] = [];
      if (item.what === "scrap") specs = [newScrap("Write something here", item.paper, where)];
      if (item.what === "tape") specs = [newTape(item.look, where)];
      if (item.what === "moment") {
        const m = momentOf(item.momentId);
        if (m !== undefined) specs = [newMoment(m._id, where)];
      }
      if (item.what === "photo") {
        const media = mediaOf(item.mediaId);
        if (media !== undefined) specs = [newPhoto(media, "print", where)];
      }
      if (specs.length === 0) return;
      const ids = await canvas.add(specs);
      select(ids.slice(0, 1));
      if (item.what === "scrap") setFocusWords((n) => n + 1);
    } catch (e) {
      fail(e);
    }
  };

  const addTitle = async (text: string) => {
    try {
      const ids = await canvas.add(newTitle(text, placeAt(nextSpot())));
      select(ids.slice(0, 1));
    } catch (e) {
      fail(e);
    }
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw === "" || !canEdit) return;
    e.preventDefault();
    try {
      void addPiece(JSON.parse(raw) as Item, worldAt(e.clientX, e.clientY));
    } catch {
      /* not one of ours */
    }
  };

  // ---- Pressing, dragging, sizing, turning ------------------------------------------

  const chainOf = (target: EventTarget | null): string[] => {
    const out: string[] = [];
    for (let el = target instanceof HTMLElement ? target : null; el !== null && el !== box.current; el = el.parentElement) {
      const id = el.dataset.nodeId;
      if (id !== undefined && treeRef.current.byId.has(id)) out.push(id);
    }
    return out;
  };

  const show = (changes: ReadonlyMap<NodeId, Change>) => {
    dragging.current = changes;
    setLive(changes);
  };

  const listen = (g: Gesture) => {
    gesture.current = g;
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const cur = gesture.current;
      if (cur === null) return stop();
      const p = worldAt(e.clientX, e.clientY);
      const t = treeRef.current;
      if (cur.kind === "move") {
        const dx = p.x - cur.start.x;
        const dy = p.y - cur.start.y;
        if (!cur.moved && Math.hypot(dx, dy) * cameraRef.current.zoom < 3) return;
        cur.moved = true;
        show(new Map(cur.ids.map((id) => [id, { x: cur.origin.get(id)!.x + dx, y: cur.origin.get(id)!.y + dy }])));
      } else if (cur.kind === "resize") {
        const next = resizeBox(cur.box, cur.handle, p.x - cur.start.x, p.y - cur.start.y, cur.ratio || e.shiftKey);
        show(new Map([[cur.id, { x: next.x, y: next.y, w: next.w, h: next.h }]]));
      } else {
        const node = t.byId.get(cur.id);
        if (node !== undefined) show(new Map([[cur.id, { rotation: turnTo(cur.center, p, e.shiftKey ? 15 : undefined) }]]));
      }
    };
    const onUp = (e: globalThis.PointerEvent) => {
      stop();
      const cur = gesture.current;
      gesture.current = null;
      if (cur === null) return;
      const p = worldAt(e.clientX, e.clientY);
      const t = treeRef.current;
      let updates: Array<{ id: NodeId } & Change> = [];
      if (cur.kind === "move" && cur.moved) {
        const dx = p.x - cur.start.x;
        const dy = p.y - cur.start.y;
        // Dropped on a frame, they join it; dropped on the desk, they leave. Letters and frames stay put.
        const target = frameAt(t, p.x, p.y, withDescendants(t, cur.ids));
        updates = cur.ids.flatMap((id) => {
          const node = t.byId.get(id);
          const from = cur.origin.get(id);
          if (node === undefined || from === undefined) return [];
          const x = round1(from.x + dx);
          const y = round1(from.y + dy);
          if (node.kind === "letter" || node.kind === "frame" || target?._id === node.parentId) return [{ id, x, y }];
          const o = originOf(node, t.byId);
          const into = target === undefined ? { x: 0, y: 0 } : worldRect(target, t.byId);
          return [{ id, x: round1(o.x + x - into.x), y: round1(o.y + y - into.y), parentId: target?._id ?? null, z: nextZ(t, target?._id) }];
        });
      } else if (cur.kind !== "move") {
        const l = dragging.current.get(cur.id);
        if (l !== undefined) updates = [{ id: cur.id, ...roundChange(l) }];
      }
      // The edit shows at once as soon as it is sent, so what was dragged can let go.
      const saving = updates.length > 0 ? canvas.change(updates) : undefined;
      show(new Map());
      saving?.catch(fail);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const roundChange = (c: Change): Change => ({
    ...c,
    ...(c.x !== undefined && { x: round1(c.x) }),
    ...(c.y !== undefined && { y: round1(c.y) }),
    ...(c.w !== undefined && { w: round1(c.w) }),
    ...(c.h !== undefined && { h: round1(c.h) }),
    ...(c.rotation !== undefined && { rotation: Math.round(normalize(c.rotation)) }),
  });

  const press = (e: PointerEvent) => {
    wrap.current?.focus({ preventScroll: true });
    if (!canEdit || at !== null || e.button !== 0) return;
    const chain = chainOf(e.target);
    if (chain.length === 0) return;
    e.stopPropagation();
    const id = pick(chain, tree.byId, scope);
    const node = id === undefined ? undefined : tree.byId.get(id);
    if (node === undefined) return;
    const parent = node.parentId === undefined ? undefined : tree.byId.get(node.parentId);
    setScope(parent?.kind === "ransom" ? parent._id : undefined);
    const already = selected.includes(node._id);
    const next = e.shiftKey ? (already ? selected.filter((s) => s !== node._id) : [...selected, node._id]) : already ? selected : [node._id];
    setSelected(next);
    if (e.shiftKey && already) return;
    const start = worldAt(e.clientX, e.clientY);
    listen({ kind: "move", ids: next, start, origin: new Map(next.flatMap((s) => { const n = tree.byId.get(s); return n === undefined ? [] : [[s, { x: n.x, y: n.y }] as const]; })), moved: false });
  };

  const doublePress = (e: React.MouseEvent) => {
    if (!canEdit || at !== null) return;
    const chain = chainOf(e.target);
    const id = pick(chain, tree.byId, scope);
    const node = id === undefined ? undefined : tree.byId.get(id);
    if (node === undefined) return;
    if (holdsLetters(node)) {
      setScope(node._id);
      setSelected([]);
    } else if (node.kind === "frame") zoomToFrame(node);
    else if (node.kind === "scrap") setFocusWords((n) => n + 1);
  };

  const beginResize = (handle: Handle, e: PointerEvent) => {
    const node = selectedNodes[0];
    if (node === undefined) return;
    listen({
      kind: "resize",
      id: node._id,
      handle,
      start: worldAt(e.clientX, e.clientY),
      box: { x: node.x, y: node.y, w: node.w, h: node.h, rotation: node.rotation },
      ratio: node.kind === "photo" || node.kind === "moment" || node.kind === "letter",
    });
  };

  const beginTurn = (e: PointerEvent) => {
    const node = selectedNodes[0];
    if (node === undefined) return;
    const r = worldRect(node, tree.byId);
    listen({ kind: "turn", id: node._id, center: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
    void e;
  };

  // ---- What you can do with a selection ---------------------------------------------

  const remove = () => {
    if (selected.length > 0) {
      canvas.remove(selected).catch(fail);
      setSelected([]);
    }
  };

  const duplicate = async () => {
    const specs = copiesOf(selected, tree);
    if (specs.length === 0) return;
    try {
      const ids = await canvas.add(specs);
      select(ids.filter((_, i) => typeof specs[i]!.parent !== "object"));
    } catch (e) {
      fail(e);
    }
  };

  const restack = (to: "front" | "back") => {
    const updates = selectedNodes.map((n) => {
      const siblings = tree.kids.get(n.parentId ?? "") ?? [];
      return { id: n._id, z: to === "front" ? nextZ(tree, n.parentId) : Math.min(0, ...siblings.map((s) => s.z)) - 1 };
    });
    canvas.change(updates).catch(fail);
  };

  const breakApart = async () => {
    const node = selectedNodes[0];
    const m = node?.momentId === undefined ? undefined : momentOf(node.momentId);
    if (node === undefined || m === undefined) return;
    try {
      const specs = piecesOfMoment(node, m);
      if (specs.length === 0) return toast.info("There's nothing in this moment to break apart.");
      const ids = await canvas.add(specs);
      await canvas.remove([node._id]);
      select(ids);
    } catch (e) {
      fail(e);
    }
  };

  const inFlow = (id: Node["_id"], action: "add" | "remove" | "earlier" | "later") => {
    const ordered = flow.map((f) => f._id);
    const i = ordered.indexOf(id);
    if (action === "add") canvas.change([{ id, order: ordered.length + 1 }]).catch(fail);
    else if (action === "remove") canvas.change([{ id, order: null }]).catch(fail);
    else {
      const j = action === "earlier" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ordered.length) return;
      const next = [...ordered];
      [next[i], next[j]] = [next[j]!, next[i]!];
      canvas.change(next.map((fid, k) => ({ id: fid, order: k + 1 }))).catch(fail);
    }
  };

  const nudge = (dx: number, dy: number) => {
    const updates = selectedNodes.map((n) => ({ id: n._id, x: n.x + dx, y: n.y + dy }));
    if (updates.length > 0) canvas.change(updates).catch(fail);
  };

  const keys = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (at !== null) {
      if (e.key === "Escape") stopFlow();
      else if (e.key === "ArrowRight") setAt((a) => Math.min(flow.length - 1, (a ?? 0) + 1));
      else if (e.key === "ArrowLeft") setAt((a) => Math.max(-1, (a ?? 0) - 1));
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
      setPlaying((p) => p && e.key === " ");
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      void (e.shiftKey ? canvas.redo() : canvas.undo()).catch(fail);
    } else if (mod && e.key.toLowerCase() === "d" && canEdit) {
      e.preventDefault();
      void duplicate();
    } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && selected.length > 0) {
      e.preventDefault();
      remove();
    } else if (e.key === "Escape") {
      if (selected.length > 0) setSelected([]);
      else setScope(undefined);
    } else if (e.key.startsWith("Arrow") && canEdit && selected.length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
    } else if (canEdit && e.key === "]") restack("front");
    else if (canEdit && e.key === "[") restack("back");
    else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") void fly(everything(), 600);
  };

  // ---- The page ----------------------------------------------------------------------

  const placed = useMemo(() => new Set(shown.flatMap((n) => (n.momentId === undefined ? [] : [n.momentId as string]))), [shown]);
  const flowPlace = selectedNodes[0]?.kind === "frame" ? (flow.findIndex((f) => f._id === selectedNodes[0]!._id) >= 0 ? flow.findIndex((f) => f._id === selectedNodes[0]!._id) : undefined) : undefined;
  const desk = at !== null && frameInFlow !== undefined ? frameLook(frameInFlow.look).surround : DESK.color;
  const editing = canEdit && at === null;
  const scoped = scope === undefined ? undefined : tree.byId.get(scope);
  const only = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={keys}
      aria-label="Collage canvas"
      className="relative flex h-[calc(100svh-15rem)] min-h-[34rem] overflow-hidden rounded-xl border border-stone-300 bg-[#efe9dc] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {editing && (
        <div className={trayOpen ? "absolute inset-y-0 left-0 z-20 flex" : "hidden md:flex"}>
          <Tray
            moments={moments ?? []}
            placedMoments={placed}
            onAdd={(item) => { void addPiece(item, nextSpot()); setTrayOpen(false); }}
            onTitle={(text) => void addTitle(text)}
          />
        </div>
      )}

      <div className="relative min-w-0 flex-1" onDragOver={(e) => canEdit && e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))} onDrop={onDrop}>
        <Canvas
          camera={camera}
          onCamera={moveCamera}
          onView={setView}
          boxRef={box}
          desk={desk}
          className="size-full cursor-default"
          onDeskDown={() => {
            wrap.current?.focus({ preventScroll: true });
            if (editing) {
              setSelected([]);
              setScope(undefined);
            }
          }}
        >
          <div className="contents" onPointerDown={press} onDoubleClick={doublePress}>
            <NodeTree tree={tree} moments={momentById} />
          </div>
          {editing && scoped !== undefined && <Outline node={scoped} tree={tree} dashed />}
          {editing && selectedNodes.length > 1 && selectedNodes.map((n) => <Outline key={n._id} node={n} tree={tree} />)}
          {editing && only !== undefined && (
            <TransformBox
              box={{ ...worldRect(only, tree.byId), rotation: only.rotation }}
              resizable={only.kind !== "ransom"}
              turnable={TURNS.has(only.kind)}
              onHandle={beginResize}
              onTurn={beginTurn}
            />
          )}
        </Canvas>

        {/* A canvas with nothing on it yet. */}
        {canvas.ready && canvas.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-stone-300 bg-[#fbf7ec]/95 p-5 text-center text-stone-900 shadow-lg">
              <div className="text-2xl" style={{ fontFamily: "var(--font-hand)" }}>{canEdit ? "Start a collage" : "No collage yet"}</div>
              <p className="mt-1 text-sm text-stone-600">
                {canEdit
                  ? "Add a frame, then drop your moments and photos on it. Tape things down, cut a title from letters, and write on scraps."
                  : "The person who made this experience hasn't put a collage together yet."}
              </p>
              {canEdit && (
                <Button className="mt-3" onClick={() => void addFrame({ what: "frame", size: "poster", look: "peach" })}>
                  <PlusIcon aria-hidden /> Add a frame
                </Button>
              )}
            </div>
          </div>
        )}

        {editing && (
          <Inspector
            nodes={selectedNodes}
            flow={{ place: flowPlace, count: flow.length }}
            focusWords={focusWords}
            onChange={(updates) => canvas.change(updates).catch(fail)}
            onRemove={remove}
            onDuplicate={() => void duplicate()}
            onRestack={restack}
            onBreakApart={() => void breakApart()}
            onFlow={inFlow}
            onZoomTo={(id) => { const n = tree.byId.get(id); if (n !== undefined) zoomToFrame(n); }}
          />
        )}

        {/* The corner controls. */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-stone-300 bg-[#f6f1e6]/95 p-1 shadow-md backdrop-blur">
          {editing && (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo (⌘Z)" disabled={!canvas.canUndo} onClick={() => void canvas.undo().catch(fail)}><Undo2Icon aria-hidden /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canvas.canRedo} onClick={() => void canvas.redo().catch(fail)}><Redo2Icon aria-hidden /></Button>
              <span aria-hidden className="mx-0.5 h-5 w-px bg-stone-300" />
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setTrayOpen((o) => !o)}>{trayOpen ? "Close" : "Add"}</Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(0.8)}><MinusIcon aria-hidden /></Button>
          <span className="w-10 text-center font-mono text-xs tabular-nums" aria-label="Zoom">{Math.round(camera.zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.25)}><PlusIcon aria-hidden /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="See everything" title="See everything (0)" onClick={() => void fly(everything(), 600)}><MaximizeIcon aria-hidden /></Button>
        </div>

        {/* The flow: play the frames in order, zooming from one to the next. */}
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-300 bg-[#f6f1e6]/95 p-1 shadow-md backdrop-blur md:top-auto md:bottom-3">
          {at === null ? (
            <Button size="sm" variant="ghost" disabled={flow.length === 0} title={flow.length === 0 ? "Put frames in the flow to play them" : "Play the flow"} onClick={startFlow}>
              <PlayIcon aria-hidden /> Play{flow.length > 0 ? ` · ${flow.length}` : ""}
            </Button>
          ) : (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Back" onClick={() => { setPlaying(false); setAt((a) => Math.max(-1, (a ?? 0) - 1)); }}><SkipBackIcon aria-hidden /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>{playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Next" disabled={at >= flow.length - 1} onClick={() => { setPlaying(false); setAt((a) => Math.min(flow.length - 1, (a ?? 0) + 1)); }}><SkipForwardIcon aria-hidden /></Button>
              <span className="mx-1 min-w-24 text-center text-xs" role="status">
                {frameInFlow === undefined ? "Everything" : `${at + 1} of ${flow.length} · ${frameInFlow.text ?? "Frame"}`}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label="Leave the flow" onClick={stopFlow}><XIcon aria-hidden /></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A box round a thing, to show where you are or what is selected with others.
function Outline({ node, tree, dashed = false }: { node: Node; tree: ReturnType<typeof indexNodes>; dashed?: boolean }) {
  const r = worldRect(node, tree.byId);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        transform: node.rotation === 0 ? undefined : `rotate(${node.rotation}deg)`,
        outline: `calc(1.5px / var(--zoom)) ${dashed ? "dashed" : "solid"} #2f6df6`,
        outlineOffset: dashed ? "calc(4px / var(--zoom))" : 0,
      }}
    />
  );
}

