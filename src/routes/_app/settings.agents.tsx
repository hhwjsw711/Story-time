import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { AgentConnections } from "@/components/settings/agent-connections";
import { AgentSetup } from "@/components/settings/agent-setup";
import { ConnectAgentForm } from "@/components/settings/connect-agent-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";

export const Route = createFileRoute("/_app/settings/agents")({ component: AgentsSettings });

const INTRO =
  'Connect Claude or another assistant so it can add and update moments for you. Everything it adds is labelled "agent", so you can always tell it from your own.';

// What a connection may and may not do, in the words a person would use.
const CAN = [
  "Read the experiences you give it, and their moments",
  "Add moments: when, where, notes, links and labels",
  "Add a note, or fix a moment's place, time or labels",
];
const CANT = [
  "Delete anything, or add and remove photos",
  "See an experience you didn't give it",
  "Do anything you couldn't do yourself",
];

function AgentsSettings() {
  // The newest token lives only here, so leaving the page forgets it.
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);

  return (
    <SettingsPage title="Agents" description={INTRO}>
      <div className="space-y-10">
        <div className="grid gap-4 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2">
          <ul aria-label="An assistant can" className="space-y-2">
            {CAN.map((line) => (
              <li key={line} className="flex gap-2">
                <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <ul aria-label="An assistant can't" className="space-y-2">
            {CANT.map((line) => (
              <li key={line} className="flex gap-2 text-muted-foreground">
                <XIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <SettingsBlock
          title="Connect an assistant"
          description="Give it a name, and choose which experiences it may add to."
        >
          <ConnectAgentForm onConnected={setFresh} />
          {fresh !== null && (
            <AgentSetup
              token={fresh.token}
              name={fresh.name}
              onHide={() => setFresh(null)}
            />
          )}
        </SettingsBlock>
        <hr />
        <SettingsBlock
          title="Connected assistants"
          description="Only what each one may do: the same as you could do yourself."
        >
          <AgentConnections />
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
}
