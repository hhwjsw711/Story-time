import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { SignedOutPage } from "@/components/sign-in-screen";
import { StoryPlayer } from "@/components/story/story-player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { MediaAuthContext } from "@/lib/use-media-url";

const search = z.object({
  // The scene in view, kept up to date as the story scrolls.
  step: z.number().int().min(0).default(0).catch(0),
});

// A story anyone can watch with its link, so there's no sign-in gate. The token
// is the URL's fragment, which browsers never send to a server, and search
// engines are kept out.
export const Route = createFileRoute("/s")({
  validateSearch: search,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: SharedStoryPage,
});

// Client only (the page isn't server-rendered), but nothing here assumes it.
function readToken(): string {
  return typeof window === "undefined" ? "" : window.location.hash.slice(1);
}

function SharedStoryPage() {
  const { step } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [token] = useState(readToken);
  const shared = useQuery(api.share.get, token ? { token } : "skip");
  useDocumentTitle(shared ? `${shared.event.title} · Story-time` : undefined);
  // The URL follows the scroll without adding history. `hash: true` keeps the
  // token in the fragment, which navigation would otherwise drop.
  const onStep = useCallback(
    (next: number) => void navigate({ search: { step: next }, hash: true, replace: true, resetScroll: false }),
    [navigate],
  );

  if (!token || shared === null) return <NotShared />;
  if (shared === undefined) return <Skeleton className="h-svh w-full rounded-none" />;
  return (
    <MediaAuthContext.Provider value={{ kind: "share", token }}>
      <StoryPlayer event={shared.event} moments={shared.moments} meId={undefined} step={step} onStep={onStep} />
    </MediaAuthContext.Provider>
  );
}

// Off, switched off, replaced, or never real: the same page for all of them.
function NotShared() {
  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl tracking-tight">This story isn't shared</h1>
        <p className="text-stone-600 dark:text-stone-400">
          The link may have been switched off or replaced. Ask whoever sent it for a new one.
        </p>
        <Button variant="outline" asChild>
          <Link to="/">Go to Story-time</Link>
        </Button>
      </div>
    </SignedOutPage>
  );
}
