import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { TagIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { MAX_LABEL_LENGTH, MAX_LABELS_PER_MOMENT } from "../../../convex/lib/limits";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deletePhotos } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A native checkbox, so it's labelled, keyboard operable and indeterminate
// for free. Clicks stay off the row underneath.
export function SelectBox({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

// The bar under a selection in the itinerary: add or remove labels, or
// delete, across every selected moment. Changes go one moment at a time
// through the usual mutations, so each is checked like a single edit.
export function BulkEditBar({
  moments,
  onClear,
  onDone,
}: {
  // The selected moments the viewer may change.
  moments: MomentView[];
  onClear: () => void;
  onDone: () => void;
}) {
  const update = useMutation(api.moments.update);
  const remove = useMutation(api.moments.remove);
  const token = useAuthToken();
  const uid = useId();
  const [progress, setProgress] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  // The moments the delete dialog asks about, fixed when it opens.
  const [toDelete, setToDelete] = useState<MomentView[]>([]);
  const [confirming, setConfirming] = useState(false);
  const busy = progress !== null;
  const n = moments.length;

  // Labels in the selection, most used first.
  const present = [...moments.flatMap((m) => m.labels).reduce((c, l) => c.set(l, (c.get(l) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // `change` returns the moment's new labels, or why it can't have them.
  async function relabel(change: (labels: string[]) => string[] | { error: string }) {
    const targets = moments;
    let updated = 0;
    const errors: string[] = [];
    for (const [i, m] of targets.entries()) {
      setProgress(`Updating ${i + 1} of ${targets.length}…`);
      const next = change(m.labels);
      if ("error" in next) {
        errors.push(next.error);
        continue;
      }
      if (next.length === m.labels.length && next.every((l, j) => l === m.labels[j])) continue;
      try {
        await update({ momentId: m._id, labels: next });
        updated++;
      } catch (e) {
        errors.push(errorMessage(e));
      }
    }
    setProgress(null);
    report(updated, errors, "Updated", "They already had those labels");
  }

  function report(done: number, errors: string[], verb: string, nothingDone: string) {
    const failed = errors.length > 0 ? `${plural(errors.length, "moment")} couldn't be changed` : "";
    const description = [...new Set(errors)].join(" ");
    if (done === 0 && errors.length === 0) toast(nothingDone);
    else if (errors.length === 0) toast.success(`${verb} ${plural(done, "moment")}`);
    else if (done === 0) toast.error(failed, { description });
    else toast.warning(`${verb} ${plural(done, "moment")} · ${failed}`, { description });
  }

  function addLabels(e: FormEvent) {
    e.preventDefault();
    // Matched ignoring case, so "Food" doesn't sit next to "food".
    const key = (l: string) => l.toLowerCase();
    const typed = draft.split(",").map((l) => l.trim()).filter(Boolean);
    const wanted = typed.filter((l, i) => typed.findIndex((x) => key(x) === key(l)) === i);
    if (wanted.length === 0) return setDraftError("Type a label first");
    const long = wanted.find((l) => l.length > MAX_LABEL_LENGTH);
    if (long) return setDraftError(`"${long}" is longer than ${MAX_LABEL_LENGTH} characters`);
    setAdding(false);
    setDraft("");
    setDraftError(null);
    void relabel((labels) => {
      const has = new Set(labels.map(key));
      const next = [...labels, ...wanted.filter((l) => !has.has(key(l)))];
      return next.length > MAX_LABELS_PER_MOMENT
        ? { error: `A moment can have at most ${MAX_LABELS_PER_MOMENT} labels.` }
        : next;
    });
  }

  async function deleteAll(targets: MomentView[]) {
    let deleted = 0;
    const errors: string[] = [];
    const removed: string[] = [];
    for (const [i, m] of targets.entries()) {
      setProgress(`Deleting ${i + 1} of ${targets.length}…`);
      try {
        const { removedMediaIds } = await remove({ momentId: m._id });
        removed.push(...removedMediaIds);
        deleted++;
      } catch (e) {
        errors.push(errorMessage(e));
      }
    }
    if (token && removed.length > 0) await deletePhotos(removed, token);
    setProgress(null);
    onClear();
    report(deleted, errors, "Deleted", "Nothing was deleted");
  }

  // Two rows in a narrow table (the count and Done, then the actions), one
  // row in a wide one: it sits in the table's @container.
  return (
    <div
      role="region"
      aria-label="Selected moments"
      className="sticky bottom-3 z-20 mx-1.5 mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg @xl:flex"
    >
      <p aria-live="polite" className="truncate px-1.5 text-[13px] @xl:me-auto">
        {progress ?? (n === 0 ? "Select moments to change them" : `${n} selected`)}
      </p>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5">
        <Popover
          open={adding}
          onOpenChange={(open) => {
            setAdding(open);
            if (!open) setDraftError(null);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={n === 0 || busy}>
              <TagIcon /> Add labels…
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-72">
            <form onSubmit={addLabels} className="space-y-2">
              <Label htmlFor={`${uid}-labels`}>Add labels to {plural(n, "moment")}</Label>
              <Input
                id={`${uid}-labels`}
                autoFocus
                placeholder="food, museum, sunset"
                aria-describedby={`${uid}-hint`}
                aria-invalid={draftError !== null}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDraftError(null);
                }}
              />
              <p id={`${uid}-hint`} className={cn("text-xs", draftError ? "text-destructive" : "text-muted-foreground")} role={draftError ? "alert" : undefined}>
                {draftError ?? "Separate labels with commas. Each moment keeps the labels it has."}
              </p>
              <Button type="submit" size="sm" className="w-full">
                Add labels
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={present.length === 0 || busy}>
              <TagsIcon /> Remove label…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="max-h-72 min-w-48">
            <DropdownMenuLabel>Remove from the selection</DropdownMenuLabel>
            {present.map(([label, count]) => (
              <DropdownMenuItem
                key={label}
                onSelect={() => void relabel((labels) => labels.filter((l) => l !== label))}
              >
                <span className="truncate">{label}</span>
                <span className="ms-auto text-xs text-muted-foreground">{count}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="destructive"
          size="sm"
          disabled={n === 0 || busy}
          onClick={() => {
            setToDelete(moments);
            setConfirming(true);
          }}
        >
          <Trash2Icon /> <span className="@max-sm:sr-only">Delete</span>
        </Button>
      </div>
      {/* Last to tab to; top right while the bar has two rows. */}
      <Button variant="ghost" size="sm" disabled={busy} onClick={onDone} className="col-start-2 row-start-1">
        Done
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${plural(toDelete.length, "moment")}?`}
        description="Their notes, links and photos are removed for everyone. This can't be undone."
        confirmLabel={`Delete ${plural(toDelete.length, "moment")}`}
        onConfirm={() => deleteAll(toDelete)}
      />
    </div>
  );
}
