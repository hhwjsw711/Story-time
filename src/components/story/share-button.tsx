import { useMutation } from "convex/react";
import { Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

// Safari only lets a click write the clipboard before its first await, so
// the write starts at once and takes the text when it's ready.
function copyLater(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem === "undefined") return text.then((t) => navigator.clipboard.writeText(t));
  const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
  return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
}

// Owners share by invite, as on the Shared tab: a one-time viewer link.
// Everyone else copies the story's own address.
export function ShareButton({ event, label }: { event: EventView; label?: string }) {
  const createInvite = useMutation(api.invites.create);
  const [busy, setBusy] = useState(false);
  const isOwner = event.role === "owner";
  const archived = event.status === "archived";

  async function share() {
    setBusy(true);
    const invite = isOwner && !archived;
    const link = invite
      ? createInvite({ eventId: event._id, role: "viewer" }).then((r) => r.link)
      : Promise.resolve(`${window.location.origin}/e/${event._id}/story`);
    const copied = copyLater(link).then(
      () => true,
      () => false,
    );
    try {
      const url = await link;
      const description = invite
        ? "It works once and expires in 7 days."
        : "Only people who already have access to this experience can open it.";
      if (await copied) toast.success(invite ? "Invite link copied" : "Link copied", { description });
      // The browser refused the clipboard: a fresh click on Copy is allowed.
      else toast(url, { description, action: { label: "Copy", onClick: () => void navigator.clipboard.writeText(url) } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (label) {
    return (
      <Button variant="secondary" onClick={() => void share()} disabled={busy}>
        <Share2Icon /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isOwner ? "Share by invite link" : "Copy link"}
      onClick={() => void share()}
      disabled={busy}
      className="text-white hover:bg-white/10 hover:text-white"
    >
      <Share2Icon />
    </Button>
  );
}
