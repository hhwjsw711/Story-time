import { PencilIcon } from "lucide-react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import { MomentAuthors } from "@/components/event/moment-card";
import { stopsOf, transportOf } from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Block = MomentView["blocks"][number];

// dateStyle can't be combined with weekday, so spell the parts out.
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The selected moment as a journey: one step per stop, each with how they got
// there, where and when, and what they shared.
export function MomentPreview({
  moment,
  mine,
  onEdit,
}: {
  moment: MomentView;
  mine: boolean;
  onEdit?: () => void;
}) {
  const stops = stopsOf(moment);

  return (
    <article aria-label="Moment preview" className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            {when(moment.startsAt)}
            {stops.length > 1 && ` · ${stops.length} stops`}
          </p>
          <MomentAuthors moment={moment} you={mine} />
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance">{moment.place ?? "A moment"}</h2>
          {moment.labels.length > 0 && (
            <ul aria-label="Labels" className="flex flex-wrap gap-1.5">
              {moment.labels.map((l) => (
                <li key={l}>
                  <Badge variant="secondary">{l}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon /> Edit
          </Button>
        )}
      </header>

      <ol className="space-y-0">
        {stops.map((stop, i) => {
          const transport = transportOf(stop.transport);
          const last = i === stops.length - 1;
          return (
            <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
              {/* The rail: a numbered dot and a line down to the next stop. */}
              <div className="flex flex-col items-center">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-amber-300/70 bg-amber-50 font-serif text-sm font-semibold text-amber-900 dark:border-amber-200/20 dark:bg-amber-200/10 dark:text-amber-100">
                  {i + 1}
                </span>
                {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
              </div>
              <section aria-label={`Stop ${i + 1}`} className={last ? "min-w-0 pb-2" : "min-w-0 pb-8"}>
                {transport && (
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <transport.icon aria-hidden className="size-3.5" />
                    {transport.phrase}
                  </p>
                )}
                <h3 className="font-serif text-lg leading-snug font-semibold">{stop.place ?? `Stop ${i + 1}`}</h3>
                {stop.startsAt !== undefined && (
                  <p className="text-sm text-muted-foreground">{when(stop.startsAt)}</p>
                )}
                <StopContent blocks={stop.blocks} />
              </section>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function StopContent({ blocks }: { blocks: Block[] }) {
  const media = blocks.filter((b) => b.type === "photo" || b.type === "video");
  const rest = blocks.filter((b) => b.type !== "photo" && b.type !== "video");
  if (blocks.length === 0) return null;
  // Photos pair up at one shape; with an odd count the first one spans the
  // row, so none is left alone. Videos keep their own width and shape.
  const photos = media.filter((b) => b.type === "photo").length;
  const firstPhoto = media.findIndex((b) => b.type === "photo");
  return (
    <div className="mt-3 space-y-3">
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {media.map((b, i) =>
            b.type === "video" ? (
              <div key={i} className="col-span-2">
                <AuthVideo mediaId={b.mediaId} label="Moment video" />
              </div>
            ) : b.type === "photo" ? (
              <AuthImage
                key={i}
                mediaId={b.mediaId}
                alt="Moment photo"
                className={cn(
                  "aspect-[4/3] rounded-xl",
                  photos % 2 === 1 && i === firstPhoto && "col-span-2 aspect-[16/10]",
                )}
              />
            ) : null,
          )}
        </div>
      )}
      {rest.map((b, i) =>
        b.type === "link" ? (
          <a
            key={i}
            href={b.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block truncate text-sm underline underline-offset-4"
          >
            {b.title ?? b.url}
          </a>
        ) : b.type === "note" ? (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
            {b.text}
          </p>
        ) : b.type === "feeling" ? (
          <p key={i} className="border-l-2 border-amber-300 pl-3 font-serif whitespace-pre-wrap italic dark:border-amber-200/40">
            {b.mood} {b.text}
          </p>
        ) : null,
      )}
    </div>
  );
}
