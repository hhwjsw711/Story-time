import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeftIcon, PlayIcon } from "lucide-react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { ActivityTab } from "@/components/event/activity-tab";
import { CommandBar } from "@/components/event/command-bar";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { eventDates } from "@/components/event/event-dates";
import { EditorPanel, type Panel } from "@/components/event/itinerary-panel";
import { QuickAddButton } from "@/components/event/quick-add";
import { SharedTab } from "@/components/event/shared-tab";
import { Timeline } from "@/components/event/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { cn } from "@/lib/utils";

const search = z.object({
  // Links to tabs that are gone fall back to the moments.
  tab: z.enum(["itinerary", "shared", "activity"]).default("itinerary").catch("itinerary"),
  panel: z.enum(["outline", "details", "moment"]).default("outline").catch("outline"),
  // The moment picked in the list.
  momentId: z.string().optional().catch(undefined),
  // The moment open in the editor, kept apart so picking another never swaps
  // out unsaved edits.
  editId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/e/$id/")({
  // Old edit links name the moment in `momentId` only.
  validateSearch: search.transform((s) => (s.panel === "moment" && !s.editId && s.momentId ? { ...s, editId: s.momentId } : s)),
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { tab, panel, momentId, editId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // A malformed id comes back as null ("not found"); nothing else queries
  // with the raw id before this resolves.
  const event = useQuery(api.events.get, { eventId: id });
  const me = useQuery(api.users.getCurrentUser);
  useDocumentTitle(event ? `${event.title} · Story-time` : undefined);

  if (event === undefined) {
    // Shaped like the page, so it doesn't jump when the experience loads.
    return (
      <div aria-hidden className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-10 w-full max-w-3xl" />
        <Skeleton className="h-72 w-full max-w-3xl" />
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
  const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);

  // Editors open beside the moments, so opening one also shows that tab.
  const openPanel = (next: Panel, nextMomentId?: string) =>
    void navigate({
      search: (s) => ({
        ...s,
        tab: "itinerary" as const,
        panel: next,
        momentId: nextMomentId ?? (next === "outline" ? s.momentId : undefined),
        editId: next === "moment" ? nextMomentId : undefined,
      }),
    });
  // Picking a moment edits it when you may; otherwise it opens in the story.
  const pick = (moment: { _id: string; authorId: string }) => {
    if (canEditMoment(moment.authorId)) openPanel("moment", moment._id);
    else void navigate({ to: "/e/$id/story", params: { id }, search: { momentId: moment._id } });
  };

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
          <EventActionsMenu event={event} onEditDetails={() => openPanel("details")} />
        </div>
      </header>

      <Tabs value={tab} onValueChange={(t) => void navigate({ search: (s) => ({ ...s, tab: t as typeof tab }) })}>
        <TabsList>
          <TabsTrigger value="itinerary">Moments</TabsTrigger>
          {isOwner && <TabsTrigger value="shared">Shared</TabsTrigger>}
          {isOwner && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>

        <TabsContent value="itinerary">
          {/* The moments, and beside them whatever is being edited. Stacked on
              narrow screens, the editor first. */}
          <div className={cn("grid gap-6", panel !== "outline" && "lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start")}>
            {panel !== "outline" && (
              <div className="min-w-0 lg:order-2 lg:sticky lg:top-4">
                <EditorPanel
                  event={event}
                  panel={panel}
                  momentId={editId}
                  canEditMoment={canEditMoment}
                  onClose={() => openPanel("outline")}
                />
              </div>
            )}
            <div className="min-w-0 max-w-3xl space-y-4 lg:order-1">
              <CommandBar event={event} openMomentId={momentId} />
              <Timeline event={event} meId={me?.id} selectedMomentId={momentId} onPick={pick} />
            </div>
          </div>
        </TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} archived={archived} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} meId={me?.id} /></TabsContent>}
      </Tabs>
    </div>
  );
}
