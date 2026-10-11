import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowUpToLineIcon, ClockIcon, ImagePlusIcon, VideoIcon, XIcon } from "lucide-react";
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { PlaceInput, reversePlace } from "@/components/event/place-input";
import { stopsOf } from "@/components/event/transport";
import type { EventView } from "@/components/event/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { deletePhotos } from "@/lib/actions";
import { dayLabel, enrichMoment, momentsFromPlan, plural, readPicked, uploadAll } from "@/lib/add-moments";
import { errorMessage } from "@/lib/errors";
import { formatTime } from "@/lib/local-time";
import { type Geo, groupPhotos, MAX_PHOTOS_PER_STOP, type PhotoPoint, toStop } from "@/lib/photo-groups";
import { MEDIA_ACCEPT } from "@/lib/upload";
import { cn } from "@/lib/utils";

// A picked file. `guessed` marks a time taken from the file's date, not the
// camera's.
type Item = { file: File; url: string; kind: "photo" | "video"; guessed: boolean; point: PhotoPoint };

// A proposed stop as it's being reviewed. `lookup` is set while its photo
// location still waits to be named.
type DraftStop = {
  key: string;
  photos: PhotoPoint[];
  startsAt: number;
  place: string;
  geo?: Geo;
  fromPhoto: boolean;
  lookup: boolean;
};
type DraftDay = { day: string; moments: DraftStop[][] };

// Photon asks for about a request a second.
const LOOKUP_GAP_MS = 1100;

const allStops = (days: DraftDay[]) => days.flatMap((d) => d.moments.flat());

// Drops stops left without photos, then moments and days left empty.
const prune = (days: DraftDay[]) =>
  days
    .map((d) => ({
      ...d,
      moments: d.moments.map((stops) => stops.filter((s) => s.photos.length > 0)).filter((stops) => stops.length > 0),
    }))
    .filter((d) => d.moments.length > 0);

// Groups the photos afresh. A stop that starts with a photo from a named
// stop keeps that name (typed or looked up).
function draftDays(points: PhotoPoint[], before: DraftDay[]): DraftDay[] {
  const old = new Map(allStops(before).flatMap((s) => s.photos.map((p) => [p.id, s] as const)));
  return groupPhotos(points).map((d) => ({
    day: d.day,
    moments: d.moments.map((stops) =>
      stops.map((s): DraftStop => {
        const key = s.photos[0]!.id;
        const prev = old.get(key);
        if (prev?.place.trim()) {
          return { ...prev, key, photos: s.photos, startsAt: s.startsAt };
        }
        return { key, photos: s.photos, startsAt: s.startsAt, place: "", geo: s.geo, fromPhoto: s.geo !== undefined, lookup: s.geo !== undefined };
      }),
    ),
  }));
}

// "Add from photos": pick a trip's photos and videos, see them sorted into a
// moment per day with a stop wherever you paused or moved on, adjust, then
// upload and create them all.
export function BulkAddSheet({
  event,
  open,
  onOpenChange,
}: {
  event: EventView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // While uploading, the sheet stays open: closing it would orphan uploads.
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent
        side="right"
        showCloseButton={!busy}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <BulkAdd event={event} onBusyChange={setBusy} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function BulkAdd({
  event,
  onBusyChange,
  onClose,
}: {
  event: EventView;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const token = useAuthToken();
  // Read at each call: tokens are short-lived and a batch can run for minutes.
  const latestToken = useRef(token);
  useEffect(() => {
    latestToken.current = token;
  }, [token]);
  const createMoment = useMutation(api.moments.create);
  const enrich = useAction(api.ai.enrich.enrich);
  const existing = useQuery(api.moments.list, { eventId: event._id });
  const uid = useId();
  const [items, setItems] = useState<ReadonlyMap<string, Item>>(() => new Map());
  const [days, setDays] = useState<DraftDay[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [work, setWork] = useState<{ label: string; done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ created: number; stopped: boolean; failures: string[] } | null>(null);
  const [stopping, setStopping] = useState(false);
  // Set by Stop, or when the sheet goes away mid-run.
  const stopped = useRef(false);
  const lastLookup = useRef(0);
  const nextId = useRef(0);
  const summary = useRef<HTMLParagraphElement>(null);
  // The element to focus once the list re-renders (by id), "" for the summary.
  const focusAfter = useRef<string | null>(null);

  // Object URLs are revoked as photos are removed, and all of them on close.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
      for (const it of itemsRef.current.values()) URL.revokeObjectURL(it.url);
    };
  }, []);

  const reviewing = days.length > 0;
  useEffect(() => {
    if (reviewing) summary.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    (document.getElementById(target) ?? summary.current)?.focus();
  }, [days]);

  // Names photo locations one at a time, about a second apart, until each
  // stop has a place or the lookup gave up. Typing a place cancels its own.
  const pending = work ? undefined : allStops(days).find((s) => s.lookup && s.geo && !s.place);
  const pendingKey = pending?.key;
  const pendingLat = pending?.geo?.lat;
  const pendingLng = pending?.geo?.lng;
  useEffect(() => {
    if (!pendingKey || pendingLat === undefined || pendingLng === undefined) return;
    let live = true;
    const timer = window.setTimeout(
      () => {
        lastLookup.current = Date.now();
        void reversePlace({ lat: pendingLat, lng: pendingLng }).then((label) => {
          if (live) updateStop(pendingKey, (s) => ({ ...s, lookup: false, place: s.place || (label ?? "") }));
        });
      },
      Math.max(0, lastLookup.current + LOOKUP_GAP_MS - Date.now()),
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [pendingKey, pendingLat, pendingLng]);

  function updateStop(key: string, change: (s: DraftStop) => DraftStop) {
    setDays((ds) => ds.map((d) => ({ ...d, moments: d.moments.map((stops) => stops.map((s) => (s.key === key ? change(s) : s))) })));
  }

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setReading(true);
    const seen = new Set([...items.values()].map(({ file: f }) => `${f.name}|${f.size}|${f.lastModified}`));
    const { picked, problems } = await readPicked(files, seen, () => `f${nextId.current++}`);
    const fresh: Item[] = picked.map((p) => ({ ...p, url: URL.createObjectURL(p.file) }));
    // Closed while reading: nothing will show these.
    if (stopped.current) {
      for (const it of fresh) URL.revokeObjectURL(it.url);
      return;
    }
    setItems((prev) => new Map([...prev, ...fresh.map((it) => [it.point.id, it] as const)]));
    // Days hold exactly the picked photos, so they regroup from themselves.
    setDays((ds) => draftDays([...allStops(ds).flatMap((s) => s.photos), ...fresh.map((it) => it.point)], ds));
    if (problems.length > 0) setSkipped((s) => [...s, ...problems]);
    setReading(false);
  }

  function forget(ids: string[]) {
    for (const id of ids) {
      const it = items.get(id);
      if (it) URL.revokeObjectURL(it.url);
    }
    setItems((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function removePhoto(stop: DraftStop, id: string) {
    const i = stop.photos.findIndex((p) => p.id === id);
    const neighbour = stop.photos[i + 1] ?? stop.photos[i - 1];
    focusAfter.current = neighbour ? `${uid}-rm-${neighbour.id}` : "";
    forget([id]);
    const photos = stop.photos.filter((p) => p.id !== id);
    setDays((ds) =>
      prune(ds.map((d) => ({ ...d, moments: d.moments.map((stops) => stops.map((s) => (s.key === stop.key ? { ...s, photos, startsAt: photos[0]?.takenAt ?? s.startsAt } : s))) }))),
    );
  }

  function dropDay(day: DraftDay) {
    focusAfter.current = "";
    forget(day.moments.flat().flatMap((s) => s.photos.map((p) => p.id)));
    setDays((ds) => ds.filter((d) => d.day !== day.day));
  }

  // Folds a stop into the one before it. The place kept is the earlier
  // stop's, unless only the later one has a name.
  function mergeUp(day: string, moment: number, index: number) {
    const a = days.find((d) => d.day === day)?.moments[moment]?.[index - 1];
    const b = days.find((d) => d.day === day)?.moments[moment]?.[index];
    if (!a || !b) return;
    focusAfter.current = `${uid}-place-${a.key}`;
    const named = a.place.trim() || !b.place.trim() ? a : b;
    const joined = toStop([...a.photos, ...b.photos]);
    const merged: DraftStop = { ...named, key: a.key, photos: joined.photos, startsAt: joined.startsAt };
    setDays((ds) =>
      ds.map((d) =>
        d.day !== day
          ? d
          : {
              ...d,
              moments: d.moments.map((stops, j) =>
                j === moment ? [...stops.slice(0, index - 1), merged, ...stops.slice(index + 1)] : stops,
              ),
            },
      ),
    );
  }

  async function create() {
    if (!token || work) return;
    const plan = days;
    const files = items;
    const ids = allStops(plan).flatMap((s) => s.photos.map((p) => p.id));
    stopped.current = false;
    setStopping(false);
    onBusyChange(true);
    const { uploaded, failures } = await uploadAll(
      ids.flatMap((id) => {
        const it = files.get(id);
        return it ? [{ id, file: it.file }] : [];
      }),
      event._id,
      () => latestToken.current ?? token,
      (done, total) => setWork({ label: `Uploading ${Math.min(done + 1, total)} of ${total}…`, done, total }),
      () => stopped.current,
    );

    const moments = momentsFromPlan(plan, uploaded, (id) => files.get(id)?.kind);
    // Media ids now on a saved moment; any other upload gets deleted.
    const used = new Set<string>();
    let created = 0;
    for (const [i, m] of moments.entries()) {
      if (stopped.current) break;
      setWork({ label: `Creating moment ${i + 1} of ${moments.length}…`, done: i, total: moments.length });
      if (!m.create) {
        failures.push(`${m.label}: none of its photos uploaded`);
        continue;
      }
      try {
        const momentId = await createMoment({ eventId: event._id, ...m.create });
        created++;
        for (const u of m.uses) used.add(u.mediaId);
        enrichMoment(
          enrich,
          momentId,
          m.uses.flatMap((u) => {
            const it = files.get(u.photoId);
            return it ? [{ mediaId: u.mediaId, file: it.file }] : [];
          }),
        );
      } catch (e) {
        failures.push(`${m.label}: ${errorMessage(e)}`);
      }
    }

    const unused = [...uploaded.values()].filter((id) => !used.has(id));
    if (unused.length > 0) await deletePhotos(unused, latestToken.current ?? token);
    setWork(null);
    onBusyChange(false);
    if (failures.length === 0 && created === moments.length) {
      toast.success(`Added ${plural(created, "moment")}`);
      onClose();
      return;
    }
    const added = `Added ${plural(created, "moment")}`;
    if (failures.length > 0) toast.warning(`${added} · ${plural(failures.length, "problem")}`);
    else if (created > 0) toast.success(added);
    setReport({ created, stopped: stopped.current, failures });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    // Not while reading: the next batch dedupes against this one's results.
    if (!work && !report && !reading) void addFiles(e.dataTransfer.files);
  }

  const stops = allStops(days);
  const counts = { photo: 0, video: 0 };
  for (const s of stops) for (const p of s.photos) counts[items.get(p.id)?.kind ?? "photo"]++;
  const guessed = stops.some((s) => s.photos.some((p) => items.get(p.id)?.guessed));
  const planned = days.reduce((n, d) => n + d.moments.length, 0);
  const left = Math.max(0, event.momentLimit - event.momentCount);
  const over = planned > left;
  // Live uploads per experience are capped (see media.reserveUpload), and
  // saved photos and videos already count.
  const saved = (existing ?? []).flatMap(stopsOf).flatMap((s) => s.blocks).filter((b) => b.type === "photo" || b.type === "video").length;
  const room = Math.max(0, event.momentLimit * 5 - saved);

  const filePicker = (className: string, children: ReactNode) => (
    <label className={cn("cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-ring", className)}>
      {children}
      <input
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        className="sr-only"
        disabled={reading}
        onChange={(e) => {
          void addFiles(e.target.files);
          // Cleared, so picking the same files again still fires.
          e.target.value = "";
        }}
      />
    </label>
  );

  let body: ReactNode;
  if (report) {
    body = (
      <div className="space-y-3">
        <p className="font-serif text-xl font-semibold">
          {report.stopped ? "Stopped. " : ""}
          {report.created > 0 ? `Added ${plural(report.created, "moment")}.` : "No moments were added."}
        </p>
        {report.failures.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">These didn't make it:</p>
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {report.failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  } else if (work) {
    body = (
      <div className="space-y-3 py-12 text-center">
        <p role="status" className="font-serif text-xl font-semibold">
          {work.label}
        </p>
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={work.total}
          aria-valuenow={work.done}
          className="mx-auto h-1.5 max-w-sm overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(work.done / Math.max(1, work.total)) * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Keep this open until it's done.</p>
      </div>
    );
  } else if (!reviewing) {
    body = (
      <div className="space-y-3">
        {filePicker(
          cn(
            "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center hover:bg-accent",
            dragging && "border-ring bg-accent",
          ),
          <>
            <ImagePlusIcon aria-hidden className="size-8 text-muted-foreground" />
            <span className="font-medium">{reading ? "Reading photos…" : dragging ? "Drop to add them" : "Choose photos and videos"}</span>
            <span className="text-sm text-muted-foreground">or drop them here. Photos up to 5 MB, videos up to 50 MB.</span>
          </>,
        )}
        <p className="text-xs text-muted-foreground">
          When and where each photo was taken is read on this device, from the photo itself. Places are named with
          OpenStreetMap.
        </p>
        <Skipped problems={skipped} onDismiss={() => setSkipped([])} />
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p ref={summary} tabIndex={-1} aria-live="polite" className="me-auto text-sm outline-none">
            {[counts.photo && plural(counts.photo, "photo"), counts.video && plural(counts.video, "video")].filter(Boolean).join(" and ")}
            {" · "}
            {plural(stops.length, "stop")} over {plural(days.length, "day")}
          </p>
          {filePicker(
            buttonVariants({ variant: "outline", size: "sm" }),
            <>
              <ImagePlusIcon aria-hidden /> {reading ? "Reading…" : "Add more"}
            </>,
          )}
        </div>
        {guessed && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ClockIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            Some times are guessed from the file's date because the file doesn't say when it was taken.
          </p>
        )}
        {items.size > room && (
          <p className="text-xs text-muted-foreground">
            This experience has room for {room} more photos and videos, so {room === 0 ? "these" : "some of these"} may
            not upload.
          </p>
        )}
        <Skipped problems={skipped} onDismiss={() => setSkipped([])} />

        {days.map((d) => {
          const label = dayLabel(d.day);
          const headingId = `${uid}-day-${d.day}`;
          const dayGeo = d.moments.flat().find((s) => s.geo)?.geo;
          return (
            <section key={d.day} aria-labelledby={headingId} className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b py-2 ps-3 pe-2">
                <h3 id={headingId} className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">
                  {label}
                </h3>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {plural(d.moments.flat().length, "stop")}
                </span>
                <Button variant="ghost" size="sm" aria-label={`Drop day: ${label}`} onClick={() => dropDay(d)}>
                  <XIcon /> <span className="max-sm:sr-only">Drop day</span>
                </Button>
              </div>
              {d.moments.map((stops, mi) => (
                <div key={stops[0]!.key}>
                  {d.moments.length > 1 && (
                    <p className="px-3 pt-3 text-xs text-muted-foreground">
                      Moment {mi + 1} of {d.moments.length}: a moment holds at most 10 stops
                    </p>
                  )}
                  <ol className="divide-y">
                    {stops.map((s, si) => {
                      const prev = stops[si - 1];
                      const tooBig = prev !== undefined && prev.photos.length + s.photos.length > MAX_PHOTOS_PER_STOP;
                      const placeId = `${uid}-place-${s.key}`;
                      return (
                        <li key={s.key} className="space-y-2 p-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium">Stop {si + 1}</span>
                            <span className="text-xs text-muted-foreground">
                              {/* On the clock where the photo was taken. */}
                              {formatTime(s.startsAt, s.photos[0]!.offsetMinutes)}
                              {items.get(s.photos[0]!.id)?.guessed && " · time guessed"}
                            </span>
                            {prev && (
                              <Button
                                variant="ghost"
                                size="xs"
                                // Not `disabled`, so it can still say why.
                                aria-disabled={tooBig}
                                className="ms-auto aria-disabled:opacity-50"
                                onClick={() =>
                                  tooBig
                                    ? toast.error(`A stop holds at most ${MAX_PHOTOS_PER_STOP} photos and videos`)
                                    : mergeUp(d.day, mi, si)
                                }
                              >
                                <ArrowUpToLineIcon /> Merge into stop {si}
                              </Button>
                            )}
                          </div>
                          <label htmlFor={placeId} className="sr-only">
                            Where was stop {si + 1} on {label}?
                          </label>
                          <PlaceInput
                            id={placeId}
                            value={s.place}
                            geo={s.geo}
                            fromPhoto={s.fromPhoto}
                            placeholder={s.lookup && s.geo ? "Looking up the place…" : "Where was this? (optional)"}
                            getBias={() => s.geo ?? dayGeo}
                            onChange={(place, geo, fromPhoto) =>
                              updateStop(s.key, (x) => ({ ...x, place, geo, fromPhoto, lookup: false }))
                            }
                          />
                          <ul aria-label={`Stop ${si + 1} photos and videos`} className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                            {s.photos.map((p) => {
                              const it = items.get(p.id);
                              if (!it) return null;
                              return (
                                <li key={p.id} className="relative">
                                  {it.kind === "photo" ? (
                                    <img
                                      src={it.url}
                                      alt={it.file.name}
                                      loading="lazy"
                                      decoding="async"
                                      className="aspect-square w-full rounded-md bg-muted object-cover"
                                    />
                                  ) : (
                                    <div title={it.file.name} className="grid aspect-square place-items-center rounded-md bg-muted text-muted-foreground">
                                      <VideoIcon aria-hidden className="size-5" />
                                      <span className="sr-only">{it.file.name}</span>
                                    </div>
                                  )}
                                  {it.guessed && (
                                    <span
                                      title="Time guessed from the file's date"
                                      className="absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm"
                                    >
                                      <ClockIcon aria-hidden className="size-3" />
                                      <span className="sr-only">Time guessed</span>
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    id={`${uid}-rm-${p.id}`}
                                    aria-label={`Remove ${it.file.name}`}
                                    onClick={() => removePhoto(s, p.id)}
                                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <XIcon className="size-3.5" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <SheetHeader className="border-b pe-12">
        <SheetTitle className="font-serif text-xl font-semibold">Add from photos</SheetTitle>
        <SheetDescription>
          Pick photos and videos from the trip. Each day becomes a moment, with a stop wherever you paused or moved on.
        </SheetDescription>
      </SheetHeader>

      <div
        className={cn("min-h-0 flex-1 overflow-y-auto p-4", dragging && reviewing && "bg-accent/50")}
        onDragOver={(e) => {
          if (work || report || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {body}
      </div>

      <SheetFooter className="border-t sm:flex-row sm:items-center">
        {report ? (
          <Button className="sm:ms-auto" onClick={onClose}>
            Done
          </Button>
        ) : work ? (
          <Button
            variant="outline"
            className="sm:ms-auto"
            disabled={stopping}
            onClick={() => {
              stopped.current = true;
              setStopping(true);
            }}
          >
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <>
            {reviewing && (
              <p id={`${uid}-limit`} className={cn("text-sm", over ? "text-destructive" : "text-muted-foreground")}>
                Creates {plural(planned, "moment")} · {left} left in this experience
                {over && (
                  <span className="block text-xs">
                    That's {planned - left} more than this experience has room for. Drop a few days to fit.
                  </span>
                )}
              </p>
            )}
            <div className="flex gap-2 sm:ms-auto">
              <Button variant="ghost" className="flex-1 sm:flex-none" onClick={onClose}>
                Cancel
              </Button>
              {reviewing && (
                <Button
                  className="flex-1 sm:flex-none"
                  aria-describedby={`${uid}-limit`}
                  disabled={over || reading || !token}
                  onClick={() => void create()}
                >
                  Create {plural(planned, "moment")}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetFooter>
    </>
  );
}

// Files that were left out, and why.
function Skipped({ problems, onDismiss }: { problems: string[]; onDismiss: () => void }) {
  if (problems.length === 0) return null;
  return (
    <div role="status" className="space-y-1 rounded-lg border border-dashed p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Left out {plural(problems.length, "file")}</p>
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {problems.slice(0, 6).map((p, i) => (
          <li key={i}>{p}</li>
        ))}
        {problems.length > 6 && <li>and {problems.length - 6} more</li>}
      </ul>
    </div>
  );
}
