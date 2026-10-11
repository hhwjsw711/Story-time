import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";

export function SharedTab({ eventId, archived }: { eventId: Id<"events">; archived: boolean }) {
  const sessions = useQuery(api.sessions.listForEvent, { eventId });
  const invites = useQuery(api.invites.listForEvent, { eventId });
  // The switched-on link, or null. Undefined while it loads.
  const publicLink = useQuery(api.share.link, { eventId });
  const enableLink = useMutation(api.share.enable);
  const disableLink = useMutation(api.share.disable);
  const rotateLink = useMutation(api.share.rotate);
  const revoke = useMutation(api.sessions.revoke);
  const createInvite = useMutation(api.invites.create);
  const dismiss = useMutation(api.invites.dismiss);
  const [role, setRole] = useState<"viewer" | "contributor">("viewer");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  async function setLinkOn(on: boolean) {
    try {
      if (on) {
        await enableLink({ eventId });
        toast.success("Link on: anyone with it can watch");
      } else {
        await disableLink({ eventId });
        toast.success("Link off: the old link no longer opens");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function invite() {
    try {
      const res = await createInvite({ eventId, role, sendTo: email.trim() || undefined });
      setLink(res.link);
      setEmail("");
      // `emailed` is false when email isn't set up on the server.
      toast.success(res.emailed ? "Invite emailed" : "Invite link created — copy it below");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-semibold">Link</h2>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="share-link-switch">Anyone with the link can watch</Label>
          <Switch
            id="share-link-switch"
            checked={Boolean(publicLink)}
            disabled={publicLink === undefined || (archived && !publicLink)}
            onCheckedChange={(on) => void setLinkOn(on)}
          />
        </div>
        {archived && !publicLink && (
          <p className="text-sm text-muted-foreground">Archived experiences can't switch on a link.</p>
        )}
        {publicLink && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="Share link"
                value={publicLink}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(publicLink).then(
                    () => toast.success("Copied"),
                    () => toast.error("Couldn't copy: select the link and copy it"),
                  )
                }
              >
                Copy
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Anyone with this link can watch without signing in. They see the moments and photos, not who added them.
            </p>
            <div>
              <Button variant="outline" size="sm" disabled={archived} onClick={() => setRotating(true)}>
                Make a new link
              </Button>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={rotating}
          onOpenChange={setRotating}
          title="Make a new link?"
          description="The current link stops working straight away. Anyone who has it will need the new one."
          confirmLabel="Make a new link"
          onConfirm={async () => {
            await rotateLink({ eventId });
            toast.success("New link ready");
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Invite someone</h2>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Role"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="viewer">Can view</option>
            <option value="contributor">Can add moments</option>
          </select>
          <Input
            className="max-w-xs"
            type="email"
            placeholder="Email (optional, not stored)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={() => void invite()}>Create invite</Button>
        </div>
        {link && (
          <div className="flex items-center gap-2 text-sm">
            <code className="truncate rounded bg-muted px-2 py-1">{link}</code>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}>
              Copy
            </Button>
            <span className="text-muted-foreground">Works once. Shown only now.</span>
          </div>
        )}
        {invites && invites.length > 0 && (
          <ul className="space-y-1 text-sm">
            {invites.map((i) => (
              <li key={i.inviteId} className="flex items-center justify-between rounded border px-3 py-2">
                <span>
                  Pending {i.role} invite, expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void dismiss({ eventId, inviteId: i.inviteId })}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">People with access</h2>
        {sessions && sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet. Only you can see this.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.map((s) => (
                <TableRow key={s._id}>
                  <TableCell>{s.displayName ?? "Anonymous"}</TableCell>
                  <TableCell className="capitalize">{s.role}</TableCell>
                  <TableCell>{new Date(s.grantedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {s.revokedAt ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void revoke({ sessionId: s._id }).then(() => toast.success("Access revoked"))}
                      >
                        Revoke access
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
