import { AuthImage, AuthVideo } from "@/components/auth-image";
import { stopsOf, transportOf } from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Badge } from "@/components/ui/badge";

export function MomentCard({ moment }: { moment: MomentView }) {
  const stops = stopsOf(moment);
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <header className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {new Date(moment.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <h3 className="font-serif text-lg leading-snug font-semibold">{moment.place ?? "A moment"}</h3>
        {moment.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {moment.labels.map((l) => (
              <Badge key={l} variant="secondary">
                {l}
              </Badge>
            ))}
          </div>
        )}
      </header>
      {stops.map((stop, s) => {
        const transport = transportOf(stop.transport);
        return (
          <section key={s} className="space-y-3">
            {/* Later stops get a heading; the first is the card's header. */}
            {s > 0 && (
              <h4 className="flex items-center gap-1.5 border-t pt-3 font-serif text-sm font-semibold">
                {transport && <transport.icon aria-label={transport.phrase} className="size-3.5 text-muted-foreground" />}
                {stop.place ?? `Stop ${s + 1}`}
              </h4>
            )}
            {stop.blocks.map((b, i) =>
              b.type === "photo" ? (
                <AuthImage key={i} mediaId={b.mediaId} alt="Moment photo" className="aspect-[4/3] rounded-lg" />
              ) : b.type === "video" ? (
                <AuthVideo key={i} mediaId={b.mediaId} label="Moment video" />
              ) : b.type === "link" ? (
                <a key={i} href={b.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm underline">
                  {b.title ?? b.url}
                </a>
              ) : b.type === "note" ? (
                <p key={i} className="whitespace-pre-wrap text-sm">{b.text}</p>
              ) : (
                <p key={i} className="border-l-2 border-amber-300 pl-3 font-serif text-sm whitespace-pre-wrap italic dark:border-amber-200/40">
                  {b.mood} {b.text}
                </p>
              ),
            )}
          </section>
        );
      })}
    </article>
  );
}
