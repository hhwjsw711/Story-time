import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/invite/$token")({ component: Invite });

function Invite() {
  const { token } = Route.useParams();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const accept = useMutation(api.invites.accept);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true; // an invite works once, so never retry
    accept({ token })
      .then((r) => navigate({ to: "/e/$id", params: { id: r.eventId } }))
      .catch((e) => setError(errorMessage(e)));
  }, [isAuthenticated, accept, token, navigate]);

  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <h1 className="font-display text-3xl tracking-tight">This invite didn't open</h1>
            <p>{error}</p>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Each invite link works once, and only for a limited time. Ask whoever sent it for a new one.
            </p>
            <Button variant="outline" asChild>
              {isAuthenticated ? <Link to="/home">Go to your experiences</Link> : <Link to="/">Go to Story-time</Link>}
            </Button>
          </div>
        ) : isLoading || isAuthenticated ? (
          <div role="status" className="flex flex-col items-center gap-3 text-center">
            <Logo className="size-10 animate-pulse" />
            {isAuthenticated && <p className="text-stone-600 dark:text-stone-400">Opening the experience…</p>}
          </div>
        ) : (
          // OAuth returns to this URL, and the effect above accepts the invite.
          <LoginForm
            heading="You're invited"
            description="Someone shared an experience with you on Story-time. It's where the people who were there put their photos together and play them back as a story. Sign in to open it."
          />
        )}
      </div>
    </SignedOutPage>
  );
}
