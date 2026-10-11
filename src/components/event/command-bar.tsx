import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { SparklesIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { MAX_COMMAND_CHARS } from "../../../convex/lib/limits";
import { findPlace, type Geo } from "@/components/event/place-input";
import { canAddTo } from "@/components/event/quick-add";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deletePhotos } from "@/lib/actions";
import { enrichMoment } from "@/lib/add-moments";
import { describeOp, placesToFind, withPins, type PlanOp } from "@/lib/command-plan";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// The geocoder asks for one lookup at a time, spaced out.
const LOOKUP_GAP_MS = 1100;

type Plan = { summary: string; needs?: string; ops: PlanOp[] };

// Pins the places a plan names, one lookup at a time, near `near`.
async function pin(ops: PlanOp[], near: Geo | undefined): Promise<PlanOp[]> {
  const found = new Map<string, Geo>();
  for (const [i, name] of placesToFind(ops).entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS));
    const hit = await findPlace(name, near);
    if (hit) found.set(name, hit.geo);
  }
  return withPins(ops, found);
}

// One box above the itinerary for everything: say what happened and it becomes
// a moment, as before; say what to change ("move this to Friday", "add Hanover
// as a stop by plane", "delete the second stop") and it shows the changes to
// approve first. Applying is one step, and all of it lands together.
export function CommandBar({ event, openMomentId }: { event: EventView; openMomentId?: string }) {
  const token = useAuthToken();
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const createMoment = useMutation(api.moments.create);
  const apply = useMutation(api.ai.command.apply);
  const propose = useAction(api.ai.command.propose);
  const enrich = useAction(api.ai.enrich.enrich);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "reading" | "applying">("idle");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();

  if (!canAddTo(event)) return null;
  const said = text.trim();
  const busy = phase !== "idle";
  const lines = plan?.ops.map((op) => describeOp(op, moments ?? [])) ?? [];
  const destructive = lines.some((line) => line.destructive);

  function cancel() {
    setPlan(null);
    setProblem(null);
    input.current?.focus();
  }

  // Something that happened, saved as a moment with only a note, stamped now.
  async function addAsMoment(note: string) {
    const momentId = await createMoment({
      eventId: event._id,
      startsAt: Date.now(),
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
      blocks: [{ type: "note", text: note }],
    });
    setText("");
    setPlan(null);
    enrichMoment(enrich, momentId, []);
    toast.success("Moment added");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!said || busy) return;
    setProblem(null);
    setPlan(null);
    setPhase("reading");
    try {
      const out = await propose({
        eventId: event._id,
        text: said,
        openMomentId,
        zone: -new Date().getTimezoneOffset(),
      });
      if (out.kind === "new") {
        await addAsMoment(said);
        return;
      }
      const open = moments?.find((m) => m._id === openMomentId)?.geo;
      setPlan({ summary: out.summary, needs: out.needs, ops: await pin(out.ops, open) });
    } catch (error) {
      // The words stay in the box, so they can be sent again or saved as a moment.
      setProblem(errorMessage(error));
    } finally {
      setPhase("idle");
    }
  }

  async function applyPlan() {
    if (plan === null || plan.ops.length === 0 || busy) return;
    setPhase("applying");
    try {
      const done = await apply({ eventId: event._id, ops: plan.ops });
      // Photos that went with a stop or a moment are cleared from storage too.
      if (token) await deletePhotos(done.removedMediaIds, token);
      for (const id of done.created) enrichMoment(enrich, id, []);
      toast.success(done.summary.charAt(0).toUpperCase() + done.summary.slice(1), { description: plan.summary || undefined });
      setPlan(null);
      setText("");
    } catch (error) {
      // Nothing was changed; the plan stays, to try again or cancel.
      setProblem(errorMessage(error));
    } finally {
      setPhase("idle");
    }
  }

  // Applying is always deliberate: a click, or ⌘/Ctrl+Enter. Plain Enter only
  // ever reads a request, and focus never jumps to Apply on its own, so an
  // extra Enter can't apply a plan nobody has looked at yet.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && (plan !== null || problem !== null)) {
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && plan !== null) {
      e.preventDefault();
      void applyPlan();
    }
  }

  return (
    <div className="space-y-2" onKeyDown={onKeyDown}>
      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2" aria-label="Add or change something">
        <Input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (plan !== null) setPlan(null);
          }}
          placeholder="What happened, or what should change?"
          aria-label="What happened, or what should change?"
          aria-describedby={hint}
          maxLength={MAX_COMMAND_CHARS}
          disabled={busy}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!said || busy}>
          <SparklesIcon /> {phase === "reading" ? "Reading…" : "Go"}
        </Button>
      </form>

      <p id={hint} className={cn("text-xs text-muted-foreground", (plan !== null || said !== "") && "sr-only")}>
        Say what happened, or what to change: “move this to Friday”, “add Hanover as a stop by plane”, “delete the second stop”.
      </p>

      <p role="status" className="sr-only">
        {phase === "reading" ? "Reading your request" : phase === "applying" ? "Applying the changes" : ""}
      </p>

      {problem !== null && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p>{problem}</p>
          <div className="flex gap-2">
            {plan === null && (
              <Button
                size="sm"
                variant="outline"
                disabled={!said || busy}
                onClick={() => {
                  setProblem(null);
                  setPhase("applying");
                  addAsMoment(said)
                    .catch((error: unknown) => setProblem(errorMessage(error)))
                    .finally(() => setPhase("idle"));
                }}
              >
                Add as a moment
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={cancel}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {plan !== null && (
        <section aria-label="Proposed changes" className="space-y-3 rounded-xl border bg-card p-3 text-sm">
          {plan.summary && <p className="font-medium text-balance">{plan.summary}</p>}
          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((line, i) => (
                <li key={i} className={cn("space-y-0.5", line.destructive && "text-destructive")}>
                  <p className="flex items-center gap-1.5 font-medium">
                    {line.destructive && <Trash2Icon aria-hidden className="size-3.5 shrink-0" />}
                    {line.heading}
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground marker:text-border">
                    {line.changes.map((change) => (
                      <li key={change} className={line.destructive ? "text-destructive" : undefined}>
                        {change}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {plan.needs && <p className="text-muted-foreground">{plan.needs}</p>}
          <div className="flex gap-2">
            {plan.ops.length > 0 && (
              <Button
                size="sm"
                variant={destructive ? "destructive" : "default"}
                disabled={busy}
                title="Apply (⌘ or Ctrl + Enter)"
                onClick={() => void applyPlan()}
              >
                {phase === "applying" ? "Applying…" : destructive ? "Apply and delete" : "Apply"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              {plan.ops.length > 0 ? "Cancel" : "Close"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
