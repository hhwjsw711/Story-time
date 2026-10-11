import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { INVITE_STASH, InvitePage } from "@/components/invite-page";

// /invite#<token>: the token is after "#", so browsers never send it to the
// server, its logs or other sites. It's kept in this tab while the opener signs
// in, and forgotten once the invite is used.
export const Route = createFileRoute("/invite/")({ component: Invite });

function readToken(): string {
  if (typeof window === "undefined") return "";
  const fromLink = window.location.hash.slice(1);
  try {
    if (fromLink) sessionStorage.setItem(INVITE_STASH, fromLink);
    return fromLink || (sessionStorage.getItem(INVITE_STASH) ?? "");
  } catch {
    return fromLink;
  }
}

function Invite() {
  const [token] = useState(readToken);
  return <InvitePage token={token} />;
}
