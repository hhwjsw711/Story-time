import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgentConnections } from "@/components/settings/agent-connections";
import { AgentSetup } from "@/components/settings/agent-setup";
import { ConnectAgentForm } from "@/components/settings/connect-agent-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";

export const Route = createFileRoute("/_app/settings/agents")({ component: AgentsSettings });

const INTRO =
  'Connect Claude or another assistant so it can add and update moments for you. Everything an agent adds is labelled "agent", so you can always tell it from your own. You can edit or remove what it adds, and disconnect it any time.';

function AgentsSettings() {
  // The newest token lives only here, so leaving the page forgets it.
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);

  return (
    <SettingsPage title="Agents" description={INTRO}>
      <div className="space-y-10">
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
