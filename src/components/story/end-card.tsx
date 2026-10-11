import { Link } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import type { EventView, MomentView } from "@/components/event/types";
import { ShareButton } from "@/components/story/share-button";
import { countStops } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { stopsOf } from "@/lib/story-steps";

// Up to nine of the trip's photos, spread evenly through it in time order.
function contactSheet(moments: MomentView[]): string[] {
  const all = [...moments]
    .sort((a, b) => a.startsAt - b.startsAt)
    .flatMap((m) => stopsOf(m).flatMap((s) => s.blocks.flatMap((b) => (b.type === "photo" ? [b.mediaId] : []))));
  const n = Math.min(9, all.length);
  return Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]!);
}

// The closing card: the trip's prints scattered on the table, a few
// numbers, then replay, share or go back.
export function EndCard({
  event,
  moments,
  onReplay,
}: {
  event: EventView;
  moments: MomentView[];
  onReplay: () => void;
}) {
  const stops = countStops(moments);
  const photos = moments.reduce(
    (n, m) => n + stopsOf(m).reduce((k, s) => k + s.blocks.filter((b) => b.type === "photo" || b.type === "video").length, 0),
    0,
  );
  const prints = contactSheet(moments);
  return (
    <section
      aria-label="The end"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-4 text-center animate-in fade-in duration-1000 sm:gap-6"
    >
      {prints.length > 0 && (
        <ul aria-label="Pictures from the experience" className="mb-2 flex max-w-[16rem] flex-wrap justify-center sm:max-w-2xl">
          {prints.map((mediaId, i) => (
            <li
              key={i}
              className="-m-1 w-20 bg-[#f3e9d6] p-1 pb-4 shadow-xl animate-in fade-in zoom-in-90 fill-mode-both duration-700 motion-reduce:animate-none sm:-m-1.5 sm:w-32 sm:p-1.5 sm:pb-6"
              style={{ rotate: `${((i * 37) % 11) - 5}deg`, animationDelay: `${300 + i * 120}ms` }}
            >
              <AuthImage mediaId={mediaId} alt="" className="aspect-square rounded-none bg-stone-800" />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm tracking-[0.3em] text-amber-200/80 uppercase">The end</p>
      <h2 className="max-w-2xl font-serif text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{event.title}</h2>
      <p className="text-sm text-white/60">
        {moments.length} {moments.length === 1 ? "moment" : "moments"} · {stops} {stops === 1 ? "stop" : "stops"} ·{" "}
        {photos} {photos === 1 ? "picture" : "pictures"}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onReplay} className="bg-amber-200 text-stone-900 hover:bg-amber-100">
          <RotateCcwIcon /> Replay
        </Button>
        <ShareButton event={event} label={event.role === "owner" ? "Share" : "Copy link"} />
        <Button variant="ghost" asChild className="text-white hover:bg-white/10 hover:text-white">
          <Link to="/e/$id" params={{ id: event._id }}>
            Back to the experience
          </Link>
        </Button>
      </div>
    </section>
  );
}
