import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Connection = FunctionReturnType<typeof api.agentTokens.list>[number];

function scopeOf(c: Connection): string {
  if (c.eventId === undefined) return "All my experiences";
  return c.eventTitle ?? "One experience";
}

function lastUsedOf(c: Connection): string {
  if (c.lastUsedAt === undefined) return "Never used";
  return `Last used ${formatDistanceToNow(c.lastUsedAt, { addSuffix: true })}`;
}

// The person's connections, newest first. Disconnecting asks first.
export function AgentConnections() {
  const connections = useQuery(api.agentTokens.list);
  const disconnect = useMutation(api.agentTokens.revoke);
  const [chosen, setChosen] = useState<Connection | null>(null);

  if (connections === undefined) return <Skeleton className="h-24 w-full" />;
  if (connections.length === 0) {
    return <p className="text-sm text-muted-foreground">No assistants connected yet.</p>;
  }

  return (
    <>
      <ul aria-label="Connected assistants" className="divide-y rounded-lg border">
        {connections.map((c) => {
          const live = c.revokedAt === undefined;
          return (
            <li
              key={c._id}
              className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="min-w-0 break-words">{c.name}</span>
                  {live ? (
                    <Badge variant="secondary">Connected</Badge>
                  ) : (
                    <Badge variant="outline">Disconnected</Badge>
                  )}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  <code className="font-mono text-xs">{c.prefix}…</code>
                  {" · "}
                  {scopeOf(c)}
                  {" · "}
                  {lastUsedOf(c)}
                </p>
              </div>
              {live && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start sm:self-auto"
                  aria-label={`Disconnect ${c.name}`}
                  onClick={() => setChosen(c)}
                >
                  Disconnect
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={chosen !== null}
        onOpenChange={(open) => {
          if (!open) setChosen(null);
        }}
        title={`Disconnect ${chosen?.name ?? "this assistant"}?`}
        description="It stops working straight away. Moments it already added stay as they are, still labelled as the assistant's. You can connect an assistant again at any time."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          if (chosen === null) return;
          await disconnect({ id: chosen._id });
          toast.success("Disconnected");
        }}
      />
    </>
  );
}
