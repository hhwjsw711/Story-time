import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { INVITE_STASH, InvitePage } from "@/components/invite-page";

// /invite#<token>: browsers don't send what follows "#" to any server. The
// token moves into this tab's sessionStorage and out of the address bar at
// once, so signing in, which hands the page's URL to the sign-in backend as
// where to come back to, carries no token either.
export const Route = createFileRoute("/invite/")({ component: Invite });

function readToken(): string {
  if (typeof window === "undefined") return "";
  const fromLink = window.location.hash.slice(1);
  try {
    if (!fromLink) return sessionStorage.getItem(INVITE_STASH) ?? "";
    sessionStorage.setItem(INVITE_STASH, fromLink);
  } catch {
    // No storage: the token stays in the address bar, the only place left.
    return fromLink;
  }
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return fromLink;
}

function Invite() {
  const [token, setToken] = useState(readToken);
  // Another invite pasted into this tab only changes the "#" part, which
  // doesn't reload the page.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.length > 1) setToken(readToken());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return <InvitePage key={token} token={token} />;
}
