import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { coverPage, momentPage, PAGE, rangeLabel } from "../../../convex/lib/journal";
import type { EventView, MomentView } from "@/components/event/types";
import { JournalPage } from "./page";

// One page of the journal, small: the picked moment's, else the cover. Until
// the journal has that page (it is made when the owner opens the journal),
// the page it will get.
export function JournalPreview({ event, momentId, scale }: { event: EventView; momentId?: string; scale: number }) {
  const journal = useQuery(api.journal.get, { eventId: event._id });
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const byId = useMemo(() => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])), [moments]);
  if (journal === undefined || moments === undefined) return <div className="animate-pulse rounded-sm bg-muted" style={{ width: PAGE.w * scale, height: PAGE.h * scale }} />;

  const index = moments.findIndex((m) => m._id === momentId);
  const first = moments[0];
  const from = event.startsAt ?? first?.startsAt;
  const page =
    index >= 0
      ? (journal.pages.find((p) => p.momentId === momentId) ?? momentPage(moments[index]!, index))
      : (journal.pages[0] ??
        coverPage({
          id: event._id,
          title: event.title,
          dates: from === undefined ? undefined : rangeLabel(from, event.endsAt ?? moments.at(-1)?.startsAt ?? from),
          photo: first && [first.blocks, ...first.stops.map((s) => s.blocks)].flat().flatMap((b) => (b.type === "photo" ? [b.mediaId] : []))[0],
        }));
  return <JournalPage page={page} moments={byId} scale={scale} className="shadow-[0_14px_36px_rgba(40,28,10,.28)]" />;
}
