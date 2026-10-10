import { ChevronDownIcon, ClockIcon, ImageIcon, MapPinIcon, TrainFrontIcon } from "lucide-react";
import { Fragment } from "react";
import { Progress, STAGE } from "@/components/landing/frames";
import { cn } from "@/lib/utils";

// Small, faithful pieces of the app for "How it works", in the app's own
// theme colours. Decorative: the step beside each one says what it shows.

const MOMENTS = [
  { day: "Sat, May 2", title: "Dinner after the ceremony", place: "Porto", time: "8:15 PM", by: "IN" },
  { day: "Sun, May 3", title: "First coffee in Lisbon", place: "Lisbon", time: "11:05 AM", by: "SM" },
  { day: "Mon, May 4", title: "Ferry back at sunset", place: "Cacilhas", time: "7:52 PM", by: "AR" },
];

// The itinerary's colour for a place, so the chips match the app.
function placeColor(place: string) {
  let hue = 0;
  for (const ch of place.toLowerCase()) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `oklch(0.65 0.16 ${hue})`;
}

function Initials({ children }: { children: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

const ROW = "grid grid-cols-[0.875rem_minmax(0,1fr)_auto_1.25rem] items-center gap-3 px-4 sm:grid-cols-[0.875rem_minmax(0,1fr)_auto_auto_1.25rem]";

// The itinerary, grouped by day.
export function MomentsFragment() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border bg-card text-sm text-card-foreground">
      <div className={cn(ROW, "border-b py-2 text-xs font-medium text-muted-foreground")}>
        <span />
        <span>Moment</span>
        <MapPinIcon className="hidden size-4 sm:block" />
        <ClockIcon className="size-4" />
        <span />
      </div>
      {MOMENTS.map((m) => (
        <Fragment key={m.title}>
          <div className="border-b bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">{m.day}</div>
          <div className={cn(ROW, "border-b py-2.5 last:border-b-0")}>
            <ImageIcon className="size-3.5 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate">{m.title}</span>
              <span className="block truncate text-xs text-muted-foreground sm:hidden">{m.place}</span>
            </span>
            <span className="hidden h-6 items-center gap-1.5 rounded-full border px-2 text-[13px] text-muted-foreground sm:inline-flex">
              <span className="size-2 rounded-full" style={{ backgroundColor: placeColor(m.place) }} />
              {m.place}
            </span>
            <span className="whitespace-nowrap text-muted-foreground">{m.time}</span>
            <Initials>{m.by}</Initials>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// The Shared tab: a one-time link, and who has access.
export function InviteFragment() {
  return (
    <div aria-hidden className="space-y-4 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <p className="font-semibold">Invite someone</p>
      <div className="flex flex-wrap gap-2">
        <span className="flex h-9 items-center gap-2 rounded-md border px-3">
          Can add moments
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </span>
        <span className="flex h-9 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground">
          Create invite
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">…/invite/7Qm2kXr9bT4wLp</code>
          <span className="rounded-md border px-2 py-1 text-xs font-medium">Copy</span>
        </div>
        <p className="text-xs text-muted-foreground">It works for the first person who opens it and expires in 7 days.</p>
      </div>
      <ul className="divide-y border-t">
        {[
          { name: "Ana", by: "AR", role: "Can view" },
          { name: "Sam", by: "SM", role: "Can add moments" },
        ].map((p) => (
          <li key={p.name} className="flex items-center gap-3 py-2.5 last:pb-0">
            <Initials>{p.by}</Initials>
            <span className="flex-1">{p.name}</span>
            <span className="text-muted-foreground">{p.role}</span>
            <span className="text-xs font-medium">Revoke</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Story mode partway through: the progress bar and a stop's caption.
export function PlaybackFragment() {
  return (
    <div aria-hidden className={cn(STAGE, "space-y-6 p-4 pb-6")}>
      <div className="flex items-center gap-3">
        <Progress count={14} current={6} />
        <span className="text-xs text-white/60 tabular-nums">7 / 14</span>
      </div>
      <div className="space-y-1 text-center">
        <p className="text-[0.625rem] tracking-[0.2em] text-amber-200/80 uppercase">
          <TrainFrontIcon className="mr-1 inline size-3 align-[-2px]" />
          By train · Sun, May 3, 11:05 AM · by Sam
        </p>
        <p className="font-serif text-2xl font-semibold">Lisbon</p>
        <p className="text-sm text-white/80">First coffee in Lisbon.</p>
      </div>
    </div>
  );
}
