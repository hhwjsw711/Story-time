import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mcpUrlFor } from "@/lib/mcp-url";

// Stands in for the address when this site's can't be worked out from its URL.
const ADDRESS_PLACEHOLDER = "<your site's MCP address>";

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it by hand.");
  }
}

// One ready-to-paste block, with its own copy button. Long lines wrap inside
// the box, so nothing scrolls the page sideways.
function Snippet({ title, hint, text }: { title: string; hint: string; text: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-medium">{title}</h5>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Copy the ${title} setup`}
          onClick={() => void copy(text, `${title} setup copied`)}
        >
          <CopyIcon /> Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">
        <code>{text}</code>
      </pre>
    </div>
  );
}

// A new connection's token, shown once, with the lines that connect an assistant
// to this site. Held only by the page that made it; it is never stored.
export function AgentSetup({
  token,
  name,
  onHide,
}: {
  token: string;
  name: string;
  onHide: () => void;
}) {
  const url = mcpUrlFor(import.meta.env.VITE_CONVEX_URL);
  const address = url ?? ADDRESS_PLACEHOLDER;
  const claudeCode = `claude mcp add --transport http story-time ${address} --header "Authorization: Bearer ${token}"`;
  const config = JSON.stringify(
    {
      mcpServers: {
        "story-time": {
          type: "http",
          url: address,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <section
      aria-labelledby="agent-setup-title"
      className="min-w-0 space-y-6 rounded-lg border p-4 sm:p-6"
    >
      <div className="space-y-3">
        <h4 id="agent-setup-title" className="font-semibold">
          Connect {name}
        </h4>
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">This is the only time you will see it.</p>
          <p className="text-muted-foreground">
            Copy the token now. If you lose it, disconnect this assistant and make a new one.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={token}
            aria-label="Connection token"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button variant="outline" onClick={() => void copy(token, "Token copied")}>
            <CopyIcon /> Copy token
          </Button>
        </div>
      </div>

      {url === undefined && (
        <p className="text-sm text-muted-foreground">
          We couldn't work out your site's MCP address from this deployment. It's your Convex site
          address with <code className="font-mono text-xs">/mcp</code> on the end, like{" "}
          <code className="font-mono text-xs break-all">https://your-deployment.convex.site/mcp</code>.
          Use that wherever you see {ADDRESS_PLACEHOLDER}.
        </p>
      )}

      <Snippet
        title="Claude Code"
        hint="Paste this into a terminal."
        text={claudeCode}
      />
      <Snippet
        title="Other assistants"
        hint="Paste this into the MCP settings of the app."
        text={config}
      />

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onHide}>
          Hide the token
        </Button>
      </div>
    </section>
  );
}
