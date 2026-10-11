import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FootprintsIcon,
  ImageIcon,
  Link2Icon,
  PlusIcon,
  SearchIcon,
  ShipIcon,
  TrainFrontIcon,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "@/components/landing/paper";
import { DrawnPhoto, PHOTOS } from "@/components/landing/photos";
import { cn } from "@/lib/utils";

// Small, faithful pieces of the app for the landing page, in the app's own
// theme colours. Decorative: the text beside each one says what it shows.

type Moment = {
  title: string;
  // Each stop, and how they got there from the one before.
  stops: Array<{ place: string; by?: LucideIcon }>;
  time: string;
  by: string;
  agent?: boolean;
};

const DAYS: Array<{ day: string; moments: Moment[] }> = [
  {
    day: "Sun, May 3",
    moments: [
      { title: "First coffee in Lisbon", stops: [{ place: "Porto" }, { place: "Lisbon", by: TrainFrontIcon }], time: "11:05 AM", by: "SM" },
      { title: "Ferry back at sunset", stops: [{ place: "Cais do Sodré" }, { place: "Cacilhas", by: ShipIcon }], time: "7:52 PM", by: "AR" },
    ],
  },
  {
    day: "Mon, May 4",
    moments: [
      {
        title: "Palaces in the fog",
        stops: [{ place: "Rossio" }, { place: "Sintra", by: TrainFrontIcon }, { place: "Pena Palace", by: FootprintsIcon }],
        time: "9:40 AM",
        by: "IN",
      },
      { title: "Pastéis for the train home", stops: [{ place: "Belém" }], time: "5:20 PM", by: "CC", agent: true },
    ],
  },
];

function Avatar({ by, agent }: { by: string; agent?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
        agent ? "bg-violet-500/20 text-violet-200" : "bg-muted text-muted-foreground",
      )}
    >
      {agent ? <BotIcon className="size-3.5" /> : by}
    </span>
  );
}

// The itinerary: search, then each day's moments with the stops they passed.
export function MomentsFragment() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border bg-card text-sm text-card-foreground shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b p-3">
        <span className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 text-muted-foreground">
          <SearchIcon className="size-3.5 shrink-0" />
          <span className="truncate text-xs">Search places, notes, people…</span>
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
          <PlusIcon className="size-3.5" /> Add
        </span>
      </div>
      {DAYS.map((d) => (
        <Fragment key={d.day}>
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            {d.day}
            <span className="tabular-nums">{d.moments.length} moments</span>
          </div>
          {d.moments.map((m) => (
            <div key={m.title} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
              <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.title}</span>
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  {m.stops.map((s, i) => {
                    const Way = s.by ?? ArrowRightIcon;
                    return (
                      <Fragment key={s.place}>
                        {i > 0 && <Way className="size-3 shrink-0" />}
                        <span className="truncate">{s.place}</span>
                      </Fragment>
                    );
                  })}
                  {m.agent && <span className="ml-1 shrink-0 rounded-full bg-violet-500/15 px-1.5 text-[10px] text-violet-200">agent</span>}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{m.time}</span>
              <Avatar by={m.by} agent={m.agent} />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

// The Shared tab: a one-time invite, and who has access.
export function InviteFragment() {
  return (
    <div aria-hidden className="space-y-4 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <p className="font-semibold">Invite someone</p>
      <div className="flex flex-wrap gap-2">
        <span className="flex h-9 items-center gap-2 rounded-md border px-3">
          Can add moments
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </span>
        <span className="flex h-9 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground">Create invite</span>
      </div>
      <ul className="divide-y border-t">
        {[
          { name: "Ana", by: "AR", role: "Can watch" },
          { name: "Sam", by: "SM", role: "Can add moments" },
        ].map((p) => (
          <li key={p.name} className="flex items-center gap-3 py-2.5 last:pb-0">
            <Avatar by={p.by} />
            <span className="flex-1">{p.name}</span>
            <span className="text-muted-foreground">{p.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The Shared tab's link: on, with the address to copy.
export function LinkFragment() {
  return (
    <div aria-hidden className="space-y-4 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Link2Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Share a link</p>
          <p className="text-xs text-muted-foreground">Anyone with it can watch, without an account.</p>
        </div>
        <span className="mt-1 flex h-5 w-9 shrink-0 items-center justify-end rounded-full bg-primary p-0.5">
          <span className="size-4 rounded-full bg-primary-foreground" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono text-xs text-muted-foreground">…/s#Qm2kXr9bT4wLpZc8</code>
        <span className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium">
          <CopyIcon className="size-3.5" /> Copy
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Switch it off and the link stops working.</p>
    </div>
  );
}

// An assistant connected over MCP, adding a moment from a terminal. Once in
// view it types the commands out and the answers follow, as a session would.
type Line = { prompt: string; typed: string } | { out: ReactNode };
const SESSION: Line[] = [
  { prompt: "$", typed: "claude mcp add --transport http story-time https://…/mcp" },
  { out: <span className="text-stone-500">Added HTTP MCP server story-time</span> },
  { prompt: "›", typed: "Add the pastéis we bought in Belém before the train home." },
  {
    out: (
      <>
        <span className="text-violet-300">● add_moment</span>
        <span className="text-stone-500"> A week in Portugal · Mon, May 4, 5:20 PM · Belém</span>
      </>
    ),
  },
  {
    out: (
      <>
        <span className="text-emerald-400">✓</span> {'Added "Pastéis for the train home", labelled Claude Code · agent.'}
      </>
    ),
  },
];
const CHAR_MS = 26;

export function AgentFragment() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  // The line being written, and how much of it is typed.
  const [line, setLine] = useState(reduced ? SESSION.length : 0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (!inView || line >= SESSION.length) return;
    const current = SESSION[line]!;
    const typing = "typed" in current && chars < current.typed.length;
    const timer = setTimeout(
      () => {
        if (typing) setChars((c) => c + 1);
        else {
          setLine((l) => l + 1);
          setChars(0);
        }
      },
      typing ? CHAR_MS : "typed" in current ? 380 : 520,
    );
    return () => clearTimeout(timer);
  }, [inView, line, chars]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="overflow-hidden rounded-xl border bg-[#0d0c0b] font-mono text-[12.5px] leading-relaxed text-stone-300 shadow-2xl shadow-black/40"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-stone-500">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="mx-auto">claude · ~/trips</span>
      </div>
      <div className="min-h-[11.5rem] space-y-2 overflow-x-auto p-4 whitespace-pre sm:p-5">
        {SESSION.slice(0, line + 1).map((l, i) => {
          if (i > line || (i === line && !("typed" in l))) return null;
          if ("out" in l) return <p key={i}>{l.out}</p>;
          const shown = i < line ? l.typed : l.typed.slice(0, chars);
          return (
            <p key={i}>
              <span className="text-amber-300">{l.prompt}</span> {shown}
              {i === line && <span className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-stone-300" />}
            </p>
          );
        })}
        {line >= SESSION.length && <span className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-stone-300" />}
      </div>
    </div>
  );
}

// The Activity tab: who did what, a person or an agent, in plain sentences.
const ACTIVITY = [
  { who: "Claude Code", agent: true, what: 'added "Pastéis for the train home"', when: "just now" },
  { who: "Sam", what: 'added 3 photos to "Ferry back at sunset"', when: "2h ago" },
  { who: "Scribe", agent: true, what: 'wrote a first line for "Palaces in the fog"', when: "2h ago" },
  { who: "Inês", what: 'edited "Dinner after the ceremony"', when: "yesterday" },
];

export function ActivityFragment() {
  return (
    <div aria-hidden className="rounded-xl border bg-card text-sm text-card-foreground shadow-2xl shadow-black/40">
      <p className="border-b px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Today</p>
      <ul className="divide-y">
        {ACTIVITY.map((a) => (
          <li key={a.who + a.what} className="flex items-center gap-3 px-4 py-3">
            <Avatar by={a.who.slice(0, 1)} agent={a.agent} />
            <p className="min-w-0 flex-1 leading-snug">
              {a.agent ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-200">
                  <BotIcon className="size-3" />
                  {a.who} · agent
                </span>
              ) : (
                <span className="font-medium">{a.who}</span>
              )}{" "}
              <span className="text-muted-foreground">{a.what}</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">{a.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The camera roll as photos are picked: the picks tick on one by one, and
// the first shows the time and place read from it.
const PICKED = new Set(["ferry", "tram", "tiles", "palace"]);

export function CameraRollFragment() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const on = inView || reduced;
  return (
    <div ref={ref} aria-hidden className="rounded-2xl border bg-card p-3 text-card-foreground shadow-2xl shadow-black/40">
      <div className="mb-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Recents</span>
        <span className="font-mono">{PICKED.size} selected</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {PHOTOS.map((p, i) => (
          <div key={p.kind} className="relative overflow-hidden rounded-md">
            <DrawnPhoto kind={p.kind} className="aspect-square w-full" />
            {PICKED.has(p.kind) && (
              <span
                className={cn(
                  "absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-amber-300 text-stone-950 shadow ring-2 ring-white/80 transition-all duration-300",
                  on ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
                style={{ transitionDelay: reduced ? undefined : `${400 + i * 220}ms` }}
              >
                <CheckIcon className="size-3" strokeWidth={3} />
              </span>
            )}
            {i === 0 && (
              <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white backdrop-blur-sm">
                {p.time} · {p.place}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
