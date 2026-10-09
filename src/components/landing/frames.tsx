import { ChevronDownIcon, ChevronUpIcon, PlayIcon, Share2Icon, ShipIcon, TrainFrontIcon, XIcon } from "lucide-react";
import { useId } from "react";
import { INK, PAPER, RUST, SunsetPhoto, TitlePage, useInView, useReducedMotion } from "@/components/landing/paper";
import { cn } from "@/lib/utils";

// Pictures of the real screens, drawn rather than captured, so they work in
// both themes and never go stale. All are decorative: the text around each
// one says what it shows.

export const STAGE = "overflow-hidden rounded-xl bg-[#141210] text-stone-100 ring-1 ring-stone-900/10 dark:ring-white/10";

// Story mode's progress segments: done, current, still to come.
export function Progress({ count, current }: { count: number; current: number }) {
  return (
    <div className="flex flex-1 gap-1">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 overflow-hidden rounded-full", i < current ? "bg-white/70" : "bg-white/15")}>
          {i === current && <span className="block h-full w-2/5 bg-amber-200" />}
        </span>
      ))}
    </div>
  );
}

// The story player as it opens: progress on top, the title page typing out.
export function PlayerFrame() {
  const reduced = useReducedMotion();
  return (
    <figure>
      <div aria-hidden className={cn(STAGE, "flex aspect-[4/5] flex-col sm:aspect-[16/10]")}>
        <div className="flex items-center gap-3 px-3 pt-3 sm:px-4">
          <Progress count={14} current={0} />
          <span className="hidden text-xs text-white/60 tabular-nums sm:inline">1 / 14</span>
          <PlayIcon className="size-4 text-white/80" />
          <Share2Icon className="size-4 text-white/80" />
          <XIcon className="size-4 text-white/80" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 sm:px-14">
          <TitlePage animate={!reduced} size="lg" className="max-w-xl" />
        </div>
        <div className="flex items-center justify-between px-3 pb-3 text-white/50">
          <ChevronUpIcon className="size-4 opacity-40" />
          <span className="flex items-center gap-1 text-xs">
            Scroll
            <ChevronDownIcon className="size-3.5" />
          </span>
          <ChevronDownIcon className="size-4 text-white" />
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        Story mode opens on a title page, typed out as you watch.
      </figcaption>
    </figure>
  );
}

// The opening scene on its own.
export function TitleFrame() {
  return (
    <div aria-hidden className={cn(STAGE, "flex aspect-[4/5] items-center justify-center px-5")}>
      <TitlePage animate={false} size="sm" />
    </div>
  );
}

// The leg from Porto to Lisbon by train, on a muted map of the coast. The
// route draws itself and the train rides it once the frame is in view.
const ROUTE = "M34 18 C37 28 39.5 38 40.5 46 C41.5 56 35 69 28.5 80";
const ROUTE_S = 3;
const LAND = "#ece3cf";
const WATER = "#cdd6d3";
const ROAD = "#dccfb5";
const LABEL = { fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif", fontSize: 2.6, fill: INK };

export function MapFrame() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  // Before it's seen, the train waits in Porto; without motion it's in Lisbon.
  const phase = reduced ? "done" : inView ? "play" : "wait";

  return (
    <div ref={ref} aria-hidden className={cn(STAGE, "flex aspect-[4/5] flex-col gap-3 p-4")}>
      <div className="text-center">
        <p className="text-[0.625rem] tracking-[0.25em] text-amber-200/80 uppercase">
          <TrainFrontIcon className="mr-1 inline size-3 align-[-2px]" />
          By train
        </p>
        <p className="mt-1 font-serif text-lg font-semibold">
          Porto <span className="text-white/40">→</span> Lisbon
        </p>
      </div>
      {/* Keyed so each phase gets a fresh SVG timeline: SMIL animations run
          from when their outermost <svg> is inserted. */}
      <svg key={phase} viewBox="0 0 80 100" preserveAspectRatio="xMidYMid slice" className="min-h-0 w-full flex-1 rounded-md">
        <rect width="80" height="100" fill={WATER} />
        <path
          d="M38 0 C37 8 35 14 34 18 C33 26 31 34 30 41 C29 49 27 55 24 60 L20 62.5 L22.5 65 C21 70 19 74 16 78 L20.5 80 C22.5 79 24.5 79 26.5 80.5 C28.5 82 30.5 83 32 82.5 C33.5 85 32 88 30 90 C28 93 28.5 97 28 100 L80 100 L80 0 Z"
          fill={LAND}
        />
        <path d="M26.5 80.5 C29 77 35 75.5 39 78 C38 81.5 34 83.5 30.5 83 Z" fill={WATER} />
        <g fill="none" stroke={WATER} strokeLinecap="round">
          <path d="M34 18 C40 17 46 19 52 17 S64 16 80 19" strokeWidth="0.7" />
          <path d="M39 78 C44 74 50 72 56 70 S70 66 80 65" strokeWidth="0.7" />
          <path d="M30 44 C34 45 38 44 42 45 S52 47 60 46" strokeWidth="0.5" />
        </g>
        <g fill="none" stroke={ROAD} strokeWidth="0.45" strokeLinecap="round">
          <path d="M36 19 C41 30 42.5 40 43 47 C43.5 58 38 70 31 79" />
          <path d="M43 47 L80 40" />
          <path d="M31 79 L80 75" />
          <path d="M35 18 L80 8" />
        </g>
        <path d="M66 0 C64 20 70 40 64 60 C62 75 70 90 68 100" fill="none" stroke="#b8a98f" strokeWidth="0.3" strokeDasharray="1 1" />
        <text x="5" y="44" fontStyle="italic" {...LABEL} fill="#7f8f8a">
          Atlantic
        </text>
        <text x="5" y="47.5" fontStyle="italic" {...LABEL} fill="#7f8f8a">
          Ocean
        </text>

        {/* The leg still to travel, then the part travelled. */}
        <path d={ROUTE} fill="none" stroke={RUST} strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="1.4 1" />
        <path
          d={ROUTE}
          pathLength={1}
          fill="none"
          stroke={RUST}
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={phase === "done" ? 0 : 1}
        >
          {phase === "play" && (
            <animate attributeName="stroke-dashoffset" from="1" to="0" dur={`${ROUTE_S}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
          )}
        </path>

        {[
          { name: "Porto", x: 34, y: 18 },
          { name: "Coimbra", x: 40.6, y: 46, minor: true },
          { name: "Lisbon", x: 28.5, y: 80 },
        ].map((p) => (
          <g key={p.name}>
            <circle cx={p.x} cy={p.y} r={p.minor ? 0.8 : 1.2} fill={p.minor ? "#8a7a68" : INK} />
            <text x={p.x + 2.4} y={p.y + 0.9} {...LABEL} fontSize={p.minor ? 2.3 : 2.8} fontWeight={p.minor ? 500 : 700} fill={p.minor ? "#8a7a68" : INK}>
              {p.name}
            </text>
          </g>
        ))}

        <g>
          {phase === "play" ? (
            <animateMotion dur={`${ROUTE_S}s`} fill="freeze" path={ROUTE} calcMode="spline" keyTimes="0;1" keyPoints="0;1" keySplines="0.4 0 0.2 1" />
          ) : (
            <animateMotion dur="0.01s" fill="freeze" path={ROUTE} keyTimes="0;1" keyPoints={phase === "done" ? "1;1" : "0;0"} />
          )}
          <circle r="3" fill={PAPER} stroke={RUST} strokeWidth="0.4" />
          <TrainFrontIcon x={-1.8} y={-1.8} width={3.6} height={3.6} color={RUST} strokeWidth={2.2} />
        </g>
      </svg>
    </div>
  );
}

// A stop: the silver medium-format camera seen from above, lens pointing
// away, hood open, the photo on its ground glass. The caption is story
// mode's own.
export function CameraFrame() {
  const uid = useId().replace(/:/g, "");
  return (
    <div aria-hidden className={cn(STAGE, "flex aspect-[4/5] flex-col")}>
      <svg viewBox="0 0 100 96" className="min-h-0 w-full flex-1">
        <defs>
          <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8f8a85" />
            <stop offset="0.2" stopColor="#e7e5e4" />
            <stop offset="0.5" stopColor="#a8a29e" />
            <stop offset="0.8" stopColor="#e7e5e4" />
            <stop offset="1" stopColor="#8f8a85" />
          </linearGradient>
          <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e7e5e4" />
            <stop offset="1" stopColor="#a8a29e" />
          </linearGradient>
          <pattern id={`${uid}-knurl`} width="1.2" height="4" patternUnits="userSpaceOnUse">
            <rect width="0.6" height="4" fill="#57534e" fillOpacity="0.55" />
          </pattern>
          <radialGradient id={`${uid}-vignette`}>
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.5" />
          </radialGradient>
          <clipPath id={`${uid}-glass`}>
            <rect x="33" y="41" width="34" height="34" />
          </clipPath>
        </defs>

        {/* Lens, pointing away from you. */}
        <rect x="36" y="8" width="28" height="24" fill={`url(#${uid}-chrome)`} />
        <rect x="36" y="15" width="28" height="6" fill={`url(#${uid}-knurl)`} />
        <rect x="34" y="5" width="32" height="5" rx="1" fill="#1c1917" />

        {/* Body, and the knobs either side. */}
        <rect x="20" y="28" width="60" height="62" rx="3" fill={`url(#${uid}-plate)`} stroke="#78716c" strokeWidth="0.4" />
        <rect x="12" y="50" width="8" height="16" rx="1" fill={`url(#${uid}-chrome)`} />
        <rect x="12" y="50" width="8" height="16" rx="1" fill={`url(#${uid}-knurl)`} />
        <rect x="80" y="52" width="7" height="12" rx="1" fill={`url(#${uid}-chrome)`} />
        <circle cx="90.5" cy="58" r="2.6" fill="#d6d3d1" stroke="#78716c" strokeWidth="0.3" />

        {/* The open hood: its rim nearest you, the ground glass at the bottom. */}
        <path d="M26 34 H74 L67 41 H33 Z" fill="#0c0a09" />
        <path d="M26 34 L33 41 V75 L26 82 Z" fill="#1c1917" />
        <path d="M74 34 V82 L67 75 V41 Z" fill="#292524" />
        <path d="M26 82 H74 L67 75 H33 Z" fill="#44403c" />
        <rect x="26" y="34" width="48" height="48" fill="none" stroke="#a8a29e" strokeWidth="0.6" />
        <g clipPath={`url(#${uid}-glass)`}>
          <g transform="translate(33 41) scale(0.5667)">
            <SunsetPhoto />
          </g>
          <g stroke="white" strokeOpacity="0.25" strokeWidth="0.2">
            <path d="M44.33 41 V75 M55.67 41 V75 M33 52.33 H67 M33 63.67 H67" />
          </g>
          <circle cx="50" cy="58" r="3" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.3" />
          <rect x="33" y="41" width="34" height="34" fill={`url(#${uid}-vignette)`} />
        </g>
        <circle cx="74" cy="87" r="1.6" fill="#e7e5e4" stroke="#78716c" strokeWidth="0.3" />
      </svg>
      <div className="space-y-1 px-4 pb-4 text-center">
        <p className="text-[0.625rem] tracking-[0.2em] text-amber-200/80 uppercase">
          <ShipIcon className="mr-1 inline size-3 align-[-2px]" />
          By boat · Mon, May 4, 7:52 PM · by Sam
        </p>
        <p className="font-serif text-lg font-semibold">Cacilhas</p>
        <p className="text-xs text-white/80">Ferry back at sunset. Nobody wanted to get off.</p>
      </div>
    </div>
  );
}
