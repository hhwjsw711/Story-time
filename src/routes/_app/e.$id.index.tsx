import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeftIcon, PlayIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { ActivityTab } from "@/components/event/activity-tab";
import { BulkAddSheet } from "@/components/event/bulk-add-sheet";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { eventDates } from "@/components/event/event-dates";
import { EditorPanel, MomentFeed, type Panel } from "@/components/event/itinerary-panel";
import { ItineraryTab } from "@/components/event/itinerary-tab";
import { MomentActionsMenu } from "@/components/event/moment-actions-menu";
import { QuickAddButton, QuickNote } from "@/components/event/quick-add";
import { SettingsTab } from "@/components/event/settings-tab";
import { SharedTab } from "@/components/event/shared-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/use-document-title";

const search = z.object({
  // Old "moments" links fall back to the itinerary, which now has a card view.
  tab: z.enum(["itinerary", "shared", "activity", "settings"]).default("itinerary").catch("itinerary"),
  groupBy: z.enum(["day", "place", "month", "none"]).default("day").catch("day"),
  view: z.enum(["table", "cards"]).default("table").catch("table"),
  panel: z.enum(["outline", "details", "new-moment", "moment"]).default("outline").catch("outline"),
  momentId: z.string().optional().catch(undefined),
  // The moment open in the editor. Kept apart from `momentId`, which follows
  // the feed as it scrolls, so scrolling never swaps out unsaved edits.
  editId: z.string().optional().catch(undefined),
  // YYYY-MM-DD: prefills the date of a new moment added from a day group.
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/e/$id/")({
  // Old edit links name the moment in `momentId` only.
  validateSearch: search.transform((s) => (s.panel === "moment" && !s.editId && s.momentId ? { ...s, editId: s.momentId } : s)),
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { tab, groupBy, view, panel, momentId, editId, day } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // A malformed id comes back as null ("not found"); nothing else queries
  // with the raw id before this resolves.
  const event = useQuery(api.events.get, { eventId: id });
  const me = useQuery(api.users.getCurrentUser);
  useDocumentTitle(event ? `${event.title} · Story-time` : undefined);
  // The table's visible moments, in its order; the feed follows it.
  const [order, setOrder] = useState<string[] | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  // Scrolling the feed selects the moment in view, without new history
  // entries. `resetScroll: false` stops the router restoring the feed's old
  // scroll position (and the window's) after each of these navigations.
  const onActiveChange = useCallback(
    (mid: string) =>
      void navigate({ search: (s) => ({ ...s, momentId: mid }), replace: true, resetScroll: false }),
    [navigate],
  );

  if (event === undefined) {
    // Shaped like the page, so it doesn't jump when the experience loads.
    return (
      <div aria-hidden className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-60" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <Skeleton className="h-72 w-full lg:w-[28rem] lg:shrink-0" />
          <Skeleton className="h-96 min-w-0 flex-1" />
        </div>
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-24 text-center">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Experience not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or you no longer have access.
        </p>
        <Button variant="outline" className="mt-2" asChild>
          <Link to="/home">
            <ArrowLeftIcon /> Back to experiences
          </Link>
        </Button>
      </div>
    );
  }

  const eventId = event._id;
  const dates = eventDates(event);
  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const canAdd = event.role !== "viewer" && !archived;
  const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);

  // Editors open under the itinerary, so opening one also shows that tab.
  // `momentId` is the moment in the preview; editing one also selects it.
  const openPanel = (next: Panel, nextMomentId?: string, nextDay?: string) =>
    void navigate({
      search: (s) => ({
        ...s,
        tab: "itinerary" as const,
        panel: next,
        momentId: nextMomentId ?? (next === "outline" ? s.momentId : undefined),
        editId: next === "moment" ? nextMomentId : undefined,
        day: nextDay,
      }),
    });
  const selectMoment = (mid: string) =>
    void navigate({ search: (s) => ({ ...s, tab: "itinerary" as const, momentId: mid }), resetScroll: false });

  return (
    <div className="space-y-5">
      {/* The experience's name, dates and size. Playing it as a story is the
          payoff, so that button leads. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance break-words sm:text-3xl">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-muted-foreground">
              {dates && <>{dates} · </>}
              {event.momentCount} {event.momentCount === 1 ? "moment" : "moments"}
            </p>
            {archived && <Badge variant="secondary">Archived</Badge>}
            {event.status === "draft" && <Badge variant="outline">Draft</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {event.momentCount > 0 && (
            <Button
              asChild
              className="bg-amber-300 text-stone-950 shadow-sm hover:bg-amber-200 dark:bg-amber-200 dark:hover:bg-amber-100"
            >
              <Link to="/e/$id/story" params={{ id }} search={{ step: 0 }}>
                <PlayIcon className="fill-current" /> Play story
              </Link>
            </Button>
          )}
          <QuickAddButton event={event} variant={event.momentCount > 0 ? "outline" : "default"} />
          <EventActionsMenu
            event={event}
            onEditDetails={() => openPanel("details")}
            onAddMoment={() => openPanel("new-moment")}
            onAddFromPhotos={() => setAddingPhotos(true)}
          />
          {canAdd && <BulkAddSheet event={event} open={addingPhotos} onOpenChange={setAddingPhotos} />}
        </div>
      </header>

      <Tabs value={tab} onValueChange={(t) => void navigate({ search: (s) => ({ ...s, tab: t as typeof tab }) })}>
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList>
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            {isOwner && <TabsTrigger value="shared">Shared</TabsTrigger>}
            {isOwner && <TabsTrigger value="activity">Activity</TabsTrigger>}
            {isOwner && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="itinerary">
          {/* Left: the itinerary, with any open editor under it. Right: the
              selected moment, stop by stop. Stacked on narrow screens. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex w-full min-w-0 flex-col gap-4 lg:w-[28rem] lg:shrink-0">
              <QuickNote event={event} />
              <ItineraryTab
                eventId={eventId}
                momentCount={event.momentCount}
                meId={me?.id}
                grouping={groupBy}
                view={view}
                onGroupingChange={(g) => void navigate({ search: (s) => ({ ...s, groupBy: g }) })}
                onViewChange={(v) => void navigate({ search: (s) => ({ ...s, view: v }) })}
                onAddToDay={canAdd ? (d) => openPanel("new-moment", undefined, d) : undefined}
                onOrderChange={setOrder}
                selectedMomentId={momentId}
                onSelectMoment={selectMoment}
                canEditMoment={canAdd ? canEditMoment : undefined}
                // Checked against the URL as it is by then: the feed may
                // have moved on while they were deleted.
                onDeleted={(ids) =>
                  void navigate({
                    search: (s) => ({
                      ...s,
                      momentId: s.momentId && ids.includes(s.momentId) ? undefined : s.momentId,
                      ...(s.editId && ids.includes(s.editId) ? { panel: "outline" as const, editId: undefined } : {}),
                    }),
                    replace: true,
                    resetScroll: false,
                  })
                }
                renderActions={(m) => (
                  <MomentActionsMenu
                    eventId={eventId}
                    moment={m}
                    canEdit={canEditMoment(m.authorId)}
                    onEdit={() => openPanel("moment", m._id)}
                    onDeleted={() => {
                      if (momentId === m._id || editId === m._id) {
                        void navigate({
                          search: (s) => ({ ...s, panel: "outline" as const, momentId: undefined, editId: undefined }),
                        });
                      }
                    }}
                  />
                )}
              />
              {panel !== "outline" && (
                <EditorPanel
                  event={event}
                  panel={panel}
                  momentId={editId}
                  day={day}
                  canEditMoment={canEditMoment}
                  onClose={() => openPanel("outline")}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <MomentFeed
                event={event}
                order={order}
                momentId={momentId}
                meId={me?.id}
                canAdd={canAdd}
                canEditMoment={canEditMoment}
                onEdit={(mid) => openPanel("moment", mid)}
                onActiveChange={onActiveChange}
              />
            </div>
          </div>
        </TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} archived={archived} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="settings"><SettingsTab eventId={eventId} /></TabsContent>}
      </Tabs>
    </div>
  );
}
