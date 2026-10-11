import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";

// Makes a connection for an assistant. The token comes back once, to the page
// that shows it, and is kept nowhere else.
export function ConnectAgentForm({
  onConnected,
}: {
  onConnected: (made: { token: string; name: string }) => void;
}) {
  const experiences = useQuery(api.events.listMine);
  const connect = useMutation(api.agentTokens.create);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  // Only experiences the person can add to. A viewer can't give an assistant one.
  const writable = (experiences ?? []).filter((e) => e.role !== "viewer");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "") return;
    setSaving(true);
    try {
      const eventId = writable.find((e) => e._id === scope)?._id;
      const made = await connect({ name: trimmed, eventId });
      onConnected({ token: made.token, name: trimmed });
      setName("");
      setScope("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-xl space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            placeholder="Claude Desktop"
            value={name}
            maxLength={40}
            autoComplete="off"
            aria-describedby="agent-name-hint"
            onChange={(e) => setName(e.target.value)}
          />
          <p id="agent-name-hint" className="text-xs text-muted-foreground">
            Shown on everything it adds.
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="agent-scope">Can use</Label>
          <select
            id="agent-scope"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">All my experiences</option>
            {writable.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={saving || trimmed === ""}>
        Connect
      </Button>
    </form>
  );
}
