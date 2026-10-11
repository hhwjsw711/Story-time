import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SignInScreen } from "@/components/sign-in-screen";
import { StoryPlayer } from "@/components/story/story-player";
import { StoryScroll } from "@/components/story/story-scroll";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { buildStorySteps, stepForMoment } from "@/lib/story-steps";

const search = z.object({
  // The scene in view, kept up to date as the story scrolls.
  step: z.number().int().min(0).default(0).catch(0),
  // Start at this moment's first scene, then drop out of the URL.
  momentId: z.string().optional().catch(undefined),
  // The memoir to read, or the film to watch.
  mode: z.enum(["read", "film"]).default("read").catch("read"),
});

// Outside `_app`, so there's no sidebar or header: the story fills the window.
export const Route = createFileRoute("/e/$id/story")({
  validateSearch: search,
  component: StoryPage,
});

function StoryPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { id } = Route.useParams();
  const { step, momentId, mode } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, isAuthenticated ? { eventId } : "skip");
  const moments = useQuery(api.moments.list, event ? { eventId } : "skip");
  const me = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");
  useDocumentTitle(event ? `${event.title} · Story-time` : undefined);
  // The URL follows the scroll without adding history; stable, so the
  // player's effects don't rerun on unrelated renders. It keeps the mode and
  // drops momentId.
  const onStep = useCallback(
    (next: number) => void navigate({ search: (prev) => ({ step: next, mode: prev.mode }), replace: true, resetScroll: false }),
    [navigate],
  );
  // Playing the film from a scene is a step forward; closing it goes back to
  // the memoir, at the scene the film had reached.
  const playFilm = useCallback((next: number) => void navigate({ search: { step: next, mode: "film" } }), [navigate]);
  const closeFilm = useCallback(
    (next: number) => void navigate({ search: { step: next, mode: "read" }, replace: true, resetScroll: false }),
    [navigate],
  );

  if (isLoading) return <Skeleton className="h-svh w-full rounded-none" />;
  // Signing in here keeps the shared link: OAuth comes back to this URL.
  if (!isAuthenticated) return <SignInScreen />;
  if (event === undefined || (event !== null && moments === undefined)) {
    return <Skeleton className="h-svh w-full rounded-none" />;
  }
  if (event === null) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">Experience not found.</p>
        <Button variant="outline" asChild>
          <Link to="/home">Back to experiences</Link>
        </Button>
      </main>
    );
  }

  const start = momentId ? stepForMoment(buildStorySteps(event.title, moments ?? []), momentId) : step;
  if (mode === "film") {
    return (
      <StoryPlayer
        event={event}
        moments={moments ?? []}
        meId={me?.id}
        step={start}
        onStep={onStep}
        onClose={closeFilm}
      />
    );
  }
  return <StoryScroll event={event} moments={moments ?? []} step={start} onStep={onStep} onPlayFilm={playFilm} />;
}
