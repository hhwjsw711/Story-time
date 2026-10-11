import { usePaginatedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActorBadge } from "@/components/event/actor-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeActorOf, type ActorView } from "@/lib/actors";
import { describeChange } from "@/lib/change-text";
import { cn } from "@/lib/utils";

type Filter = "everyone" | "people" | "agents";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "people", label: "People" },
  { value: "agents", label: "Agents" },
];

// The system's changes have no person or agent behind them, so they only show under Everyone.
function matches(filter: Filter, actor: ActorView): boolean {
  if (filter === "agents") return actor.kind === "agent";
  if (filter === "people") return actor.kind === "human";
  return true;
}

// The full date, for the tooltip on the relative one.
const fullDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ActivityTab({ eventId }: { eventId: Id<"events"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.changes.listForEvent,
    { eventId },
    { initialNumItems: 25 },
  );
  const [filter, setFilter] = useState<Filter>("everyone");
  if (status === "LoadingFirstPage") return <Skeleton className="h-48 w-full" />;

  if (results.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing yet. Edits by people and agents show up here.
      </p>
    );
  }

  const actorOf = (c: (typeof results)[number]) => changeActorOf(c, c.actorName);
  const shown = results.filter((c) => matches(filter, actorOf(c)));
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Show changes by" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filter === value && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {label}
            <span className="text-xs tabular-nums opacity-70">
              {results.filter((c) => matches(value, actorOf(c))).length}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          None of the loaded edits are from {filter === "agents" ? "agents" : "people"}.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => (
              <TableRow key={c._id}>
                <TableCell className="text-muted-foreground">
                  <time dateTime={new Date(c.at).toISOString()} title={fullDate(c.at)}>
                    {formatDistanceToNow(c.at, { addSuffix: true })}
                  </time>
                </TableCell>
                <TableCell>
                  <ActorBadge actor={actorOf(c)} />
                </TableCell>
                <TableCell className="whitespace-normal">{describeChange(c)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(25)}>Load more</Button>
      )}
    </div>
  );
}
