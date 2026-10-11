import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { XIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { EventDetailsForm } from "@/components/event/event-details-form";
import { MomentForm } from "@/components/event/moment-form";
import { MomentPreview } from "@/components/event/moment-preview";
import { QuickAddButton } from "@/components/event/quick-add";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// "outline" means no editor is open; the others name the open form.
export type Panel = "outline" | "details" | "new-moment" | "moment";

// Tailwind's `lg`. From here up the feed sits beside the table and scrolls on
// its own, one moment per screen: the viewport less the header, title and tabs
// above it. Narrower, it's stacked under the table and moves with the page, so
// there's never a scroller inside a scroller.
const WIDE = "(min-width: 64rem)";
const FEED_HEIGHT = "lg:h-[calc(100svh-14rem)]";

// Shows a moment chosen in the table. Wide screens scroll the feed (MomentFeed
// does, when `momentId` changes); narrow ones scroll the page to it, on every
// choice, so picking the moment that's already selected still goes there.
export function revealMoment(id: string) {
  if (matchMedia(WIDE).matches) return;
  document.querySelector(`[data-moment-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
}

const TITLES: Record<Exclude<Panel, "outline">, string> = {
  details: "Experience details",
  "new-moment": "New moment",
  moment: "Edit moment",
};

// The form under the itinerary, in the left column: experience details, a new
// moment, or a moment being edited (`momentId`; not the one in the feed,
// which changes as it scrolls).
export function EditorPanel({
  event,
  panel,
  momentId,
  day,
  canEditMoment,
  onClose,
}: {
  event: EventView;
  panel: Exclude<Panel, "outline">;
  momentId?: string;
  day?: string;
  canEditMoment: (authorId: string) => boolean;
  onClose: () => void;
}) {
  const moments = useQuery(api.moments.list, { eventId: event._id });

  let body;
  if (panel === "details") {
    body = <EventDetailsForm event={event} onDone={onClose} />;
  } else if (panel === "new-moment") {
    // `key` resets the form when another day's "+" is used.
    body = (
      <MomentForm
        key={day ?? "new"}
        eventId={event._id}
        day={day}
        full={event.momentCount >= event.momentLimit}
        onDone={onClose}
      />
    );
  } else if (moments === undefined) {
    body = <Skeleton className="h-[32rem] w-full" />;
  } else {
    const moment = moments.find((m) => m._id === momentId);
    body = !moment ? (
      <p className="text-sm text-muted-foreground">This moment is no longer here.</p>
    ) : canEditMoment(moment.authorId) ? (
      // `key` resets the form when another moment is selected.
      <MomentForm key={moment._id} eventId={event._id} moment={moment} onDone={onClose} />
    ) : (
      <p className="text-sm text-muted-foreground">Only its author or the owner can edit this moment.</p>
    );
  }

  return (
    <section aria-label={TITLES[panel]} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{TITLES[panel]}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      {body}
    </section>
  );
}

// The right side: every visible moment as a journey, one per screen, in the
// table's order. Scrolling snaps moment to moment and reports the one in view;
// selecting a row jumps here.
export function MomentFeed({
  event,
  order,
  momentId,
  meId,
  canAdd,
  canEditMoment,
  onEdit,
  onActiveChange,
}: {
  event: EventView;
  // Moment ids from the table; null until it has loaded.
  order: string[] | null;
  momentId?: string;
  meId?: string;
  canAdd: boolean;
  canEditMoment: (authorId: string) => boolean;
  onEdit: (momentId: string) => void;
  onActiveChange: (momentId: string) => void;
}) {
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const feed = useRef<HTMLDivElement>(null);
  // The moment the feed last reported, so selecting it doesn't scroll again.
  const reported = useRef<string | undefined>(undefined);

  const byId = useMemo(() => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])), [moments]);
  const list = (order ?? []).flatMap((id) => byId.get(id) ?? []);
  const ids = list.map((m) => m._id).join(",");

  // Jump to a moment chosen in the table. Instant, so the moments passed on
  // the way don't each report themselves as active. Wide screens only: on
  // narrow ones the feed doesn't scroll, and revealMoment moves the page.
  useEffect(() => {
    const root = feed.current;
    if (!root || !momentId || momentId === reported.current) return;
    // Escaped: the id comes from the URL.
    const el = root.querySelector<HTMLElement>(`[data-moment-id="${CSS.escape(momentId)}"]`);
    if (el) root.scrollTo({ top: el.offsetTop });
  }, [momentId, ids]);

  // The moment crossing the middle line of whatever scrolls (the feed on wide
  // screens, the page on narrow ones) is the active one; this works for
  // moments taller than the feed too. Rebuilt when the breakpoint is crossed,
  // as when a tablet turns.
  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const wide = matchMedia(WIDE);
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const next = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = entry.target.getAttribute("data-moment-id");
            if (entry.isIntersecting && id && id !== reported.current) {
              reported.current = id;
              onActiveChange(id);
            }
          }
        },
        { root: wide.matches ? root : null, rootMargin: "-50% 0px -50% 0px" },
      );
      root.querySelectorAll("[data-moment-id]").forEach((el) => next.observe(el));
      observer = next;
    };
    observe();
    wide.addEventListener("change", observe);
    return () => {
      wide.removeEventListener("change", observe);
      observer?.disconnect();
    };
  }, [ids, onActiveChange]);

  const empty = (
    <div className="space-y-3 rounded-xl border border-dashed border-amber-900/15 bg-[#f3e9d6]/40 p-8 text-center dark:border-amber-100/10 dark:bg-amber-100/[0.03]">
      <p className="font-serif text-lg">The story starts with a moment.</p>
      <p className="text-sm text-muted-foreground">Moments you add show up here, stop by stop.</p>
      {canAdd && (
        <QuickAddButton event={event} variant="outline" size="sm">
          Add photos
        </QuickAddButton>
      )}
    </div>
  );
  // Loading takes the loaded shape, so nothing jumps: the empty state when
  // there's nothing to load, else a moment-shaped placeholder.
  if (moments === undefined || order === null) {
    if (event.momentCount === 0) return empty;
    return (
      <div aria-hidden className={cn(FEED_HEIGHT, "space-y-3 py-4")}>
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="mt-6 aspect-[4/3] w-full max-w-2xl rounded-xl" />
      </div>
    );
  }
  if (moments.length === 0) return empty;
  if (list.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No moments match.</p>;
  }
  return (
    <div
      ref={feed}
      aria-label="Moments"
      className={cn(
        FEED_HEIGHT,
        "relative lg:sticky lg:top-4 lg:snap-y lg:snap-mandatory lg:overflow-y-auto lg:overscroll-contain",
      )}
    >
      {list.map((moment) => (
        <section
          key={moment._id}
          data-moment-id={moment._id}
          className="border-b py-4 last:border-b-0 lg:min-h-full lg:snap-start lg:pr-2"
        >
          <MomentPreview
            moment={moment}
            mine={moment.authorId === meId}
            onEdit={canEditMoment(moment.authorId) ? () => onEdit(moment._id) : undefined}
          />
        </section>
      ))}
    </div>
  );
}
