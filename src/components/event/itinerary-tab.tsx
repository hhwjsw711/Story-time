import { useQuery } from "convex/react";
import {
  BotIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  HeartIcon,
  ImageIcon,
  Layers2Icon,
  LinkIcon,
  ListFilterIcon,
  MapIcon,
  MapPinIcon,
  PaperclipIcon,
  PlusIcon,
  RouteIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import {
  columnFilteringFeature,
  columnGroupingFeature,
  createColumnHelper,
  createFilteredRowModel,
  createGroupedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActorBadge } from "@/components/event/actor-badge";
import { BulkEditBar, SelectBox } from "@/components/event/bulk-edit-bar";
import { MomentCard } from "@/components/event/moment-card";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/components/user-avatar";
import { authorOf, describeActor, editorOf } from "@/lib/actors";
import {
  allBlocks,
  type AgentFilter,
  type BlockType,
  type MomentFilters,
  isFiltering,
  matches,
  NO_PLACE,
  noFilters,
} from "@/lib/moment-filters";
import { cn } from "@/lib/utils";

export type Grouping = "day" | "place" | "month" | "none";
export type ItineraryView = "table" | "cards" | "map";

// MapLibre is large, so the map view loads it only when opened.
const ItineraryMap = lazy(() => import("@/components/event/itinerary-map").then((m) => ({ default: m.ItineraryMap })));

// The outline links to groups by this id.
export const groupAnchor = (key: string) => `group-${key}`;

const BLOCKS: Array<{ type: BlockType; label: string; icon: typeof ImageIcon }> = [
  { type: "photo", label: "Photos", icon: ImageIcon },
  { type: "video", label: "Videos", icon: VideoIcon },
  { type: "note", label: "Notes", icon: FileTextIcon },
  { type: "link", label: "Links", icon: LinkIcon },
  { type: "feeling", label: "Feelings", icon: HeartIcon },
];

const GROUPINGS: Array<{ value: Grouping; label: string }> = [
  { value: "day", label: "Day" },
  { value: "place", label: "Place" },
  { value: "month", label: "Month" },
  { value: "none", label: "None" },
];

const AGENT_CHOICES: Array<{ value: AgentFilter; label: string }> = [
  { value: "any", label: "Anyone" },
  { value: "hide", label: "People only" },
  { value: "only", label: "Agents only" },
];

const GROUP_ICON = { day: CalendarIcon, month: CalendarDaysIcon, place: MapPinIcon } as const;

// One grid for headers and rows, so the columns line up. Columns fold away as
// the table narrows (it is a container): first the type icon and Contains,
// then Place, which moves under the title, then Time and Who, which join it.
const GRID =
  "grid items-center gap-x-3 px-4 grid-cols-[minmax(0,1fr)_1.5rem_2rem] @sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_6.5rem_1.5rem_2rem] @xl:grid-cols-[minmax(0,1fr)_8rem_minmax(0,10rem)_6.5rem_1.5rem_2rem] @3xl:grid-cols-[1rem_minmax(0,1fr)_7.5rem_8rem_minmax(0,10rem)_6.5rem_1.5rem_2rem]";

const date = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function whenText(ms: number, timeOnly: boolean | undefined) {
  const when = new Date(ms);
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return timeOnly ? time : `${date(when)}, ${time}`;
}

// Under the title while their columns are folded away: the time (narrowest
// tables only) and the place, unless the title already is the place.
function Subtitle({ moment, title, timeOnly }: { moment: MomentView; title: string | undefined; timeOnly: boolean | undefined }) {
  const place = title === moment.place ? null : (moment.place ?? "No place");
  return (
    <span className="block truncate text-xs text-muted-foreground @xl:hidden">
      <span className="@sm:hidden">
        {whenText(moment.startsAt, timeOnly)}
        {place && " · "}
      </span>
      {place}
    </span>
  );
}

function groupLabel(grouping: Grouping, key: string, label: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (grouping === "day" && d) {
    return new Date(y!, m! - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (grouping === "month" && m) {
    return new Date(y!, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return label;
}

// `dayKey` is the author's local day the itinerary groups by, when known.
type Row = MomentView & { groupKey: string; groupLabel: string; dayKey?: string };

type Meta = {
  meId?: string;
  timeOnly: boolean;
  // While picking moments for a bulk edit, a row click toggles its checkbox.
  selecting: boolean;
  onSelectMoment: (momentId: string) => void;
  renderActions: (moment: MomentView) => ReactNode;
};

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
  tableMeta: metaHelper<Meta>(),
  columnMeta: metaHelper<{ className?: string }>(),
});

const helper = createColumnHelper<typeof features, Row>();

// Cell order is the grid's column order. `meta.className` folds a column
// away as the table narrows (see GRID).
const columns = helper.columns([
  // The server's group key (author-local day, month or place): grouped on,
  // never rendered. Groups sort by label: day and month labels are their
  // keys, which sort chronologically as strings; place keys are hashes, so
  // places sort by name instead.
  helper.accessor("groupKey", {
    id: "group",
    sortFn: (a, b) => a.original.groupLabel.localeCompare(b.original.groupLabel),
  }),
  helper.display({
    id: "glyph",
    meta: { className: "hidden justify-center @3xl:flex" },
    cell: ({ row }) => {
      const blocks = allBlocks(row.original);
      const kind = BLOCKS.find((b) => blocks.some((x) => x.type === b.type));
      const Glyph = kind?.icon ?? FileTextIcon;
      return <Glyph aria-hidden className="size-3.5 text-muted-foreground" />;
    },
  }),
  helper.accessor((m) => firstLine(m) ?? "", {
    id: "title",
    header: "Moment",
    meta: { className: "min-w-0" },
    cell: ({ row, table }) => {
      const m = row.original;
      const title = firstLine(m);
      if (table.options.meta?.selecting) {
        // The row's checkbox is the keyboard way in.
        return (
          <>
            <span className={cn("block truncate", !title && "text-muted-foreground")}>{title ?? "Untitled moment"}</span>
            <Subtitle moment={m} title={title} timeOnly={table.options.meta?.timeOnly} />
          </>
        );
      }
      return (
        <>
          {/* The row is clickable; this button is the keyboard way in. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              table.options.meta?.onSelectMoment(m._id);
            }}
            className={cn(
              "block max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !title && "text-muted-foreground",
            )}
          >
            {title ?? "Untitled moment"}
          </button>
          <Subtitle moment={m} title={title} timeOnly={table.options.meta?.timeOnly} />
        </>
      );
    },
  }),
  helper.display({
    id: "contains",
    header: () => <PaperclipIcon aria-label="Contains" className="size-4" />,
    meta: { className: "hidden @3xl:flex" },
    cell: ({ row }) => <Contains moment={row.original} />,
  }),
  helper.accessor((m) => m.place ?? NO_PLACE, {
    id: "place",
    header: () => <MapPinIcon aria-label="Place" className="size-4" />,
    meta: { className: "hidden min-w-0 @xl:flex" },
    cell: ({ row }) => <PlaceChip place={row.original.place} />,
  }),
  // Who added the moment. Folds away below `@sm`, with the time.
  helper.display({
    id: "who",
    header: () => <UsersIcon aria-label="Who" className="size-4" />,
    meta: { className: "hidden min-w-0 @sm:block" },
    cell: ({ row, table }) => <Who moment={row.original} meId={table.options.meta?.meId} />,
  }),
  helper.accessor("startsAt", {
    header: () => <ClockIcon aria-label="Time" className="size-4" />,
    meta: { className: "hidden truncate whitespace-nowrap text-muted-foreground @sm:block" },
    cell: ({ getValue, table }) => whenText(getValue(), table.options.meta?.timeOnly),
  }),
  helper.accessor((m) => m.authorName ?? "", {
    id: "author",
    meta: { className: "flex justify-end" },
    cell: ({ row, table }) => {
      const m = row.original;
      const mine = m.authorId === table.options.meta?.meId;
      const name = m.authorName ?? "Anonymous";
      // An agent's moment shows a robot, not the initials of the person it acts
      // for, so it can be told apart where the Who column has folded away.
      const agent = m.authorAgent !== undefined;
      const who = agent ? describeActor(authorOf(m)) : mine ? "You" : name;
      return (
        <>
          <span className="sr-only">By {agent ? who : mine ? "you" : name}</span>
          <span
            aria-hidden
            title={who}
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-card",
              agent ? "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200" : "bg-muted text-muted-foreground",
            )}
          >
            {agent ? <BotIcon className="size-3" /> : initials(m.authorName) || <UserIcon className="size-3" />}
          </span>
        </>
      );
    },
  }),
  helper.display({
    id: "actions",
    meta: { className: "flex justify-end" },
    cell: ({ row, table }) => table.options.meta?.renderActions(row.original),
  }),
]);

const EMPTY: Row[] = [];
const GROUPED = ["group"];
const UNGROUPED: string[] = [];

export function ItineraryTab({
  eventId,
  momentCount,
  meId,
  grouping,
  view,
  onGroupingChange,
  onViewChange,
  onAddToDay,
  onOrderChange,
  selectedMomentId,
  onSelectMoment,
  renderActions,
  canEditMoment,
  onDeleted,
}: {
  eventId: Id<"events">;
  // How many moments are coming, so the loading state can take their shape.
  momentCount?: number;
  meId?: string;
  grouping: Grouping;
  view: ItineraryView;
  onGroupingChange: (g: Grouping) => void;
  onViewChange: (v: ItineraryView) => void;
  // Only passed when the viewer may add moments.
  onAddToDay?: (day: string) => void;
  // The visible moments, in table order (grouping, filters and sort applied).
  onOrderChange?: (momentIds: string[]) => void;
  selectedMomentId?: string;
  onSelectMoment: (momentId: string) => void;
  renderActions: (moment: MomentView) => ReactNode;
  // Only passed when the viewer may change moments; turns on bulk editing.
  canEditMoment?: (authorId: string) => boolean;
  // After a bulk delete, with the ids deleted.
  onDeleted?: (momentIds: string[]) => void;
}) {
  // "None" still asks for days: the rows come back the same, just ungrouped.
  const groups = useQuery(api.itinerary.grouped, {
    eventId,
    groupBy: grouping === "none" ? "day" : grouping,
  });
  const [filters, setFilters] = useState<MomentFilters>(noFilters);
  const [newestFirst, setNewestFirst] = useState(false);
  // Bulk editing: picking moments in the table, then acting on them at once.
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const selectToggle = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const canSelect = canEditMoment !== undefined && view === "table";
  const selectionOn = selecting && canSelect;
  const editable = (m: MomentView) => canEditMoment?.(m.authorId) ?? false;
  const setRows = (ids: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setChecked(new Set());
    selectToggle.current?.focus();
  };
  // Escape leaves selection mode, unless an open menu or dialog took it, or
  // it was clearing a text field.
  useEffect(() => {
    if (!selectionOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input:not([type=checkbox]), textarea, [role=dialog]")) return;
      setSelecting(false);
      setChecked(new Set());
      selectToggle.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectionOn]);
  // "/" jumps to the search from anywhere outside a text field, as on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Day groups (also behind "None") are keyed by the author's local day,
  // which the date filter then uses too.
  const byDay = grouping === "day" || grouping === "none";
  const data = useMemo(
    () =>
      groups?.flatMap((g) =>
        g.moments.map((m) => ({ ...m, groupKey: g.key, groupLabel: g.label, dayKey: byDay ? g.key : undefined })),
      ) ?? EMPTY,
    [groups, byDay],
  );
  const places = useMemo(
    () => [...new Set(data.map((m) => m.place ?? NO_PLACE))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const labels = useMemo(
    () => [...new Set(data.flatMap((m) => m.labels))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  // Everyone with a moment here, you first.
  const people = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; initials: string }>();
    for (const m of data) {
      if (!byId.has(m.authorId)) {
        byId.set(m.authorId, {
          id: m.authorId,
          name: m.authorId === meId ? "You" : (m.authorName ?? "Anonymous"),
          initials: initials(m.authorName),
        });
      }
    }
    return [...byId.values()].sort((a, b) => Number(b.id === meId) - Number(a.id === meId));
  }, [data, meId]);
  const filtering = isFiltering(filters);
  const chips = activeChips(filters, people, setFilters);
  // Groups sort by key: newest first reverses days and months, while places
  // stay alphabetical. Within a group, moments sort by time.
  const sorting = useMemo(
    () => [
      { id: "group", desc: newestFirst && grouping !== "place" },
      { id: "startsAt", desc: newestFirst },
    ],
    [newestFirst, grouping],
  );

  const table = useTable({
    features,
    columns,
    data,
    state: {
      grouping: grouping === "none" ? UNGROUPED : GROUPED,
      sorting,
      globalFilter: filtering ? filters : undefined,
    },
    initialState: { expanded: true },
    // Keep collapsed groups collapsed when moments change live.
    autoResetExpanded: false,
    globalFilterFn: (row, _columnId, f: MomentFilters) => matches(row.original, f),
    // One column is enough: the filter looks at the whole moment.
    getColumnCanGlobalFilter: (column) => column.id === "title",
    meta: { meId, timeOnly: grouping === "day", selecting: selectionOn, onSelectMoment, renderActions },
  });

  const all = data.length;
  const count = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const leaves = rows.flatMap((r) => (r.getIsGrouped() ? r.subRows : [r]));
  // The map numbers its stops oldest first, so the feed follows that order there.
  const shown = view === "map" ? [...leaves].sort((a, b) => a.original.startsAt - b.original.startsAt) : leaves;
  const order = groups === undefined ? null : shown.map((r) => r.original._id).join(",");
  useEffect(() => {
    if (order !== null) onOrderChange?.(order === "" ? [] : order.split(","));
  }, [order, onOrderChange]);
  const headers = table.getHeaderGroups()[0]!.headers.filter((h) => h.column.id !== "group");

  // The selected moments the viewer may change, in table order. Filtered
  // out ones drop out of the selection while hidden.
  const checkedMoments = selectionOn
    ? leaves.flatMap((r) => (checked.has(r.original._id) && editable(r.original) ? [r.original] : []))
    : [];
  // A select-all for some rows: every one of them the viewer may change.
  const selectAll = (subRows: typeof leaves, label: string) => {
    const ids = subRows.filter((r) => editable(r.original)).map((r) => r.original._id);
    const on = ids.filter((id) => checked.has(id)).length;
    const box = (
      <SelectBox
        label={label}
        checked={ids.length > 0 && on === ids.length}
        indeterminate={on > 0}
        disabled={ids.length === 0}
        onChange={(v) => setRows(ids, v)}
      />
    );
    return ids.length > 0 ? box : locked(box, "None of these are yours to change");
  };

  const row = (r: (typeof rows)[number]) => {
    const selected = r.original._id === selectedMomentId;
    const cells = r
      .getAllCells()
      .filter((c) => c.column.id !== "group")
      .map((c) => (
        <span
          key={c.id}
          className={c.column.columnDef.meta?.className}
          onClick={c.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
        >
          <table.FlexRender cell={c} />
        </span>
      ));
    if (selectionOn) {
      // A checkbox leads the row, outside the grid, so columns still line up
      // with the header's.
      const m = r.original;
      const canChange = editable(m);
      const on = canChange && checked.has(m._id);
      const when = new Date(m.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      const name = `${firstLine(m) ?? "Untitled moment"}, ${when}`;
      const box = (
        <SelectBox
          label={canChange ? `Select ${name}` : `${name}. Only its author or the owner can change it`}
          checked={on}
          disabled={!canChange}
          onChange={(v) => setRows([m._id], v)}
        />
      );
      return (
        <li
          key={r.id}
          onClick={canChange ? () => setRows([m._id], !on) : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-lg ps-4",
            canChange ? "cursor-pointer" : "text-muted-foreground",
            on ? "bg-accent" : canChange && "hover:bg-muted/50",
          )}
        >
          {canChange ? box : locked(box, "Only its author or the owner can change this moment")}
          <div className={cn(GRID, "min-w-0 flex-1 py-1.5 ps-3")}>{cells}</div>
        </li>
      );
    }
    return (
      <li
        key={r.id}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelectMoment(r.original._id)}
        className={cn(GRID, "min-h-11 cursor-pointer rounded-lg py-1.5", selected ? "bg-accent" : "hover:bg-muted/50")}
      >
        {cells}
      </li>
    );
  };

  // The header strip: a group's header, or the column header when ungrouped.
  // In selection mode it leads with the group's select-all.
  const headerRow = (opts: {
    label: ReactNode;
    glyph?: ReactNode;
    end?: ReactNode;
    sticky?: boolean;
    select?: ReactNode;
  }) => {
    const strip = cn(
      "h-9 rounded-lg bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))]",
      opts.sticky && "group/header sticky top-0 z-10",
    );
    const cells = headers.map((h) => {
      switch (h.column.id) {
        case "glyph":
          return (
            <span key={h.id} className={h.column.columnDef.meta?.className}>
              {opts.glyph}
            </span>
          );
        case "title":
          return <span key={h.id} className="flex min-w-0">{opts.label}</span>;
        case "author":
          return (
            <span key={h.id} className="col-[-3/-1] flex items-center justify-end gap-1">
              {opts.end}
            </span>
          );
        case "actions":
          return null;
        default:
          return (
            <span key={h.id} className={cn(h.column.columnDef.meta?.className, "text-muted-foreground")}>
              <table.FlexRender header={h} />
            </span>
          );
      }
    });
    if (!selectionOn) return <div className={cn(GRID, strip)}>{cells}</div>;
    return (
      <div className={cn("flex items-center ps-4", strip)}>
        {opts.select ?? <span aria-hidden className="size-4 shrink-0" />}
        <div className={cn(GRID, "min-w-0 flex-1 ps-3")}>{cells}</div>
      </div>
    );
  };

  let body: ReactNode;
  const empty = <p className="py-12 text-center text-muted-foreground">No moments yet. Add one to start the itinerary.</p>;
  if (groups === undefined) {
    // Shaped like what's coming, so the editor below doesn't jump when it
    // loads: the empty state, or a header strip and a row per moment.
    body =
      momentCount === 0 ? (
        empty
      ) : (
        <div aria-hidden className="space-y-1 px-1.5 pb-1.5">
          <Skeleton className="h-9 rounded-lg" />
          {Array.from({ length: Math.min(momentCount ?? 3, 6) }, (_, i) => (
            <div key={i} className="flex h-11 items-center gap-3 px-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="size-5 rounded-full" />
            </div>
          ))}
        </div>
      );
  } else if (all === 0) {
    body = empty;
  } else if (count === 0) {
    body = (
      <div className="space-y-3 py-12 text-center">
        <p className="text-muted-foreground">No moments match.</p>
        <Button variant="outline" size="sm" onClick={() => setFilters(noFilters)}>
          Clear filters
        </Button>
      </div>
    );
  } else if (view === "map") {
    body = (
      <div className="px-1.5 pb-1.5">
        <Suspense fallback={<div aria-hidden className="h-[28rem] rounded-lg border" />}>
          <ItineraryMap moments={leaves.map((r) => r.original)} selectedMomentId={selectedMomentId} onSelectMoment={onSelectMoment} />
        </Suspense>
      </div>
    );
  } else if (view === "cards") {
    body = (
      <div className="grid gap-4 p-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((r) => (
          <MomentCard key={r.id} moment={r.original} meId={meId} />
        ))}
      </div>
    );
  } else if (grouping === "none") {
    body = (
      <div className="px-1.5 pb-1.5">
        {headerRow({
          label: <span className="px-0 font-medium">Moment</span>,
          select: selectionOn && selectAll(leaves, "Select all moments"),
        })}
        <ul className="py-1">{rows.map(row)}</ul>
      </div>
    );
  } else {
    const Glyph = GROUP_ICON[grouping];
    body = (
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        {rows.map((g) => {
          const key = String(g.groupingValue);
          const label = groupLabel(grouping, key, g.subRows[0]?.original.groupLabel ?? key);
          const open = g.getIsExpanded();
          return (
            <section key={g.id} id={groupAnchor(key)} aria-label={label} className="scroll-mt-4">
              {headerRow({
                sticky: true,
                select: selectionOn && selectAll(g.subRows, `Select all moments in ${label}`),
                glyph: <Glyph aria-hidden className="size-3.5 text-muted-foreground" />,
                label: (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${label}, ${g.subRows.length} moment${g.subRows.length === 1 ? "" : "s"}`}
                    onClick={() => g.toggleExpanded()}
                    className="-ms-2 flex max-w-full min-w-0 items-center gap-2 justify-self-start rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate font-medium">{label}</span>
                    <span className="rounded-full bg-foreground/5 px-1.5 text-xs leading-5 text-muted-foreground">
                      {g.subRows.length}
                    </span>
                  </button>
                ),
                end: (
                  <>
                    {grouping === "day" && onAddToDay && (
                      <button
                        type="button"
                        aria-label={`Add a moment to ${label}`}
                        onClick={() => onAddToDay(key)}
                        // Shown on hover, focus and touch screens.
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity group-hover/header:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-100"
                      >
                        <PlusIcon className="size-4" />
                      </button>
                    )}
                    <ChevronDownIcon
                      aria-hidden
                      className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
                    />
                  </>
                ),
              })}
              {open && <ul className="py-1">{g.subRows.map(row)}</ul>}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    // A container, so columns fold based on the table's own width: with the
    // panel open it is much narrower than the screen.
    <div className="@container rounded-xl border bg-card text-sm text-card-foreground">
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-2">
        {/* A radio group: the arrow keys move between the choices. */}
        <RadioGroupPrimitive.Root
          aria-label="Group by"
          value={grouping}
          onValueChange={(v) => {
            const next = GROUPINGS.find((g) => g.value === v);
            if (next) onGroupingChange(next.value);
          }}
          className="inline-flex rounded-full text-[13px]"
        >
          {GROUPINGS.map((g) => (
            <RadioGroupPrimitive.Item
              key={g.value}
              value={g.value}
              className="rounded-full px-3 py-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-muted data-[state=checked]:text-foreground data-[state=checked]:shadow-sm data-[state=unchecked]:text-muted-foreground data-[state=unchecked]:hover:text-foreground"
            >
              {g.label}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        <People
          people={people}
          selected={filters.authors}
          onChange={(authors) => setFilters({ ...filters, authors })}
        />

        {/* Always visible. Full width on phones, where it gets its own line. */}
        <div className="relative w-full sm:w-72">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInput}
            type="search"
            aria-label="Search moments"
            aria-keyshortcuts="/"
            placeholder="Search places, notes, people…"
            className="h-8 pr-8 pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              setFilters({ ...filters, search: "" });
              e.currentTarget.blur();
            }}
          />
          {filters.search === "" && (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1 text-[11px] text-muted-foreground sm:block"
            >
              /
            </kbd>
          )}
        </div>

        <div className="ms-auto flex min-w-0 items-center gap-0.5">
          {canSelect && all > 0 && (
            <Button
              ref={selectToggle}
              variant={selectionOn ? "secondary" : "ghost"}
              size="sm"
              onClick={() => (selectionOn ? stopSelecting() : setSelecting(true))}
            >
              {selectionOn ? "Done" : "Select"}
            </Button>
          )}
          <FiltersPopover
            filters={filters}
            places={places}
            labels={labels}
            defaultMonth={data[0] ? new Date(data[0].startsAt) : undefined}
            onChange={setFilters}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="View options">
                <Layers2Icon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={view} onValueChange={(v) => onViewChange(v as ItineraryView)}>
                <DropdownMenuRadioItem value="table">Table</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cards">Cards</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="map"><MapIcon />Map</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Order</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={newestFirst ? "newest" : "oldest"}
                onValueChange={(v) => setNewestFirst(v === "newest")}
              >
                <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center gap-1.5 px-4 pb-2", !filtering && "sr-only")}>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {count === all ? `${count} moment${count === 1 ? "" : "s"}` : `${count} of ${all} moments`}
        </p>
        {chips.map((c) => (
          <span
            key={c.key}
            className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full border border-primary bg-primary ps-2.5 pe-0.5 text-[13px] text-primary-foreground"
          >
            <span className="truncate">{c.label}</span>
            <button
              type="button"
              aria-label={`Remove filter: ${c.label}`}
              onClick={c.onRemove}
              className="flex size-5 shrink-0 items-center justify-center rounded-full outline-none hover:bg-primary-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        {filtering && (
          <Button variant="ghost" size="xs" onClick={() => setFilters(noFilters)}>
            Clear all
          </Button>
        )}
      </div>

      {body}

      {selectionOn && all > 0 && (
        <BulkEditBar moments={checkedMoments} onClear={() => setChecked(new Set())} onDone={stopSelecting} onDeleted={onDeleted} />
      )}
    </div>
  );
}

// A disabled checkbox can't show a tooltip itself, so its wrapper does.
function locked(box: ReactNode, reason: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed [&>input]:pointer-events-none">{box}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

// The people behind the moments, as overlapping avatars. Each one toggles a
// filter to that person's moments.
// ponytail: shows everyone; collapse the tail into "+N" if experiences get
// more than a handful of contributors.
function People({
  people,
  selected,
  onChange,
}: {
  people: Array<{ id: string; name: string; initials: string }>;
  selected: string[];
  onChange: (authors: string[]) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by person" className="flex items-center ps-1.5">
      {people.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            aria-label={p.name === "You" ? "Only your moments" : `Only ${p.name}'s moments`}
            title={p.name}
            onClick={() => onChange(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
            className={cn(
              "-ms-1.5 flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold ring-2 outline-none transition-[opacity,box-shadow] focus-visible:z-10 focus-visible:ring-ring hover:z-10",
              on ? "z-10 ring-primary" : "ring-card",
              selected.length > 0 && !on && "opacity-50 hover:opacity-100",
            )}
          >
            {p.initials || <UserIcon aria-hidden className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

function Contains({ moment }: { moment: MomentView }) {
  const blocks = allBlocks(moment);
  const counts = BLOCKS.map((b) => ({ ...b, n: blocks.filter((x) => x.type === b.type).length })).filter(
    (b) => b.n > 0,
  );
  const stops = moment.stops.length + 1;
  if (counts.length === 0 && stops === 1) return null;
  return (
    <span className="inline-flex h-6 items-center gap-2.5 rounded-full border px-2 text-[13px] text-muted-foreground">
      {stops > 1 && (
        <span className="inline-flex items-center gap-1" title="Stops">
          <RouteIcon aria-hidden className="size-3.5" />
          {stops}
          <span className="sr-only">stops</span>
        </span>
      )}
      {counts.map(({ type, label, icon: Icon, n }) => (
        <span key={type} className="inline-flex items-center gap-1" title={label}>
          <Icon aria-hidden className="size-3.5" />
          {n}
          <span className="sr-only">{label.toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}

// Who added a moment. An agent's later edit gets its own line, unless it is
// the same agent that added the moment.
function Who({ moment, meId }: { moment: MomentView; meId?: string }) {
  const editor = editorOf(moment);
  return (
    <div className="min-w-0 space-y-0.5 overflow-hidden">
      <ActorBadge actor={authorOf(moment)} you={moment.authorId === meId} />
      {editor?.kind === "agent" && editor.name !== moment.authorAgent && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          edited by <ActorBadge actor={editor} />
        </span>
      )}
    </div>
  );
}

function PlaceChip({ place }: { place?: string }) {
  if (!place) {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-dashed px-2 text-[13px] whitespace-nowrap text-muted-foreground">
        No place
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[13px] text-muted-foreground">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: placeColor(place) }} />
      <span className="truncate">{place}</span>
    </span>
  );
}

// A stable color per place, so the same place reads the same everywhere.
function placeColor(place: string) {
  let hue = 0;
  for (const ch of place.toLowerCase()) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `oklch(0.65 0.16 ${hue})`;
}

// Keys typed into a field belong to the field, not to the page's shortcuts.
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

function firstLine(m: MomentView) {
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling") return b.text.split("\n")[0]!.trim() || undefined;
    if (b.type === "link") return b.title ?? b.url;
  }
  // Nothing written (say, added from photos): its first named place.
  return m.place ?? m.stops.find((s) => s.place)?.place;
}

function FiltersPopover({
  filters,
  places,
  labels,
  defaultMonth,
  onChange,
}: {
  filters: MomentFilters;
  places: string[];
  labels: string[];
  defaultMonth?: Date;
  onChange: (f: MomentFilters) => void;
}) {
  const active =
    filters.places.length +
    filters.contains.length +
    filters.labels.length +
    (filters.from ? 1 : 0) +
    (filters.agents === "any" ? 0 : 1);
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={active ? `Filters, ${active} active` : "Filters"} className="relative">
          <ListFilterIcon />
          {active > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[min(22rem,calc(100vw-2rem))] space-y-4">
        <FilterChips
          label="Place"
          options={places.map((p) => ({ value: p, label: p === NO_PLACE ? "No place" : p }))}
          selected={filters.places}
          onToggle={(p) => onChange({ ...filters, places: toggle(filters.places, p) })}
        />
        <FilterChips
          label="Contains"
          options={BLOCKS.map((b) => ({ value: b.type, label: b.label }))}
          selected={filters.contains}
          onToggle={(t) => onChange({ ...filters, contains: toggle(filters.contains, t as BlockType) })}
        />
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Added by</p>
          <RadioGroupPrimitive.Root
            aria-label="Added by"
            value={filters.agents}
            onValueChange={(v) => {
              const choice = AGENT_CHOICES.find((c) => c.value === v);
              if (choice) onChange({ ...filters, agents: choice.value });
            }}
            className="flex flex-wrap gap-1.5"
          >
            {AGENT_CHOICES.map((c) => (
              <RadioGroupPrimitive.Item
                key={c.value}
                value={c.value}
                className="h-7 rounded-full border px-2.5 text-[13px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=unchecked]:text-muted-foreground data-[state=unchecked]:hover:text-foreground"
              >
                {c.label}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </div>
        {labels.length > 0 && (
          <FilterChips
            label="Labels"
            options={labels.map((l) => ({ value: l, label: l }))}
            selected={filters.labels}
            onToggle={(l) => onChange({ ...filters, labels: toggle(filters.labels, l) })}
          />
        )}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Dates
            {filters.from && (
              <span className="font-normal">
                {" · "}
                {date(filters.from)}
                {filters.to && ` – ${date(filters.to)}`}
              </span>
            )}
          </p>
          <Calendar
            mode="range"
            className="p-0"
            selected={{ from: filters.from, to: filters.to }}
            defaultMonth={filters.from ?? defaultMonth}
            onSelect={(r) => onChange({ ...filters, from: r?.from, to: r?.to })}
          />
        </div>
        {active > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onChange({ ...noFilters, search: filters.search })}
          >
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

type Chip = { key: string; label: string; onRemove: () => void };

// One removable chip per active filter, in the order the popover lists them.
function activeChips(
  filters: MomentFilters,
  people: Array<{ id: string; name: string }>,
  onChange: (f: MomentFilters) => void,
): Chip[] {
  const chips: Chip[] = [];
  const search = filters.search.trim();
  if (search !== "") {
    chips.push({ key: "search", label: `Search: ${search}`, onRemove: () => onChange({ ...filters, search: "" }) });
  }
  for (const place of filters.places) {
    chips.push({
      key: `place:${place}`,
      label: `Place: ${place === NO_PLACE ? "No place" : place}`,
      onRemove: () => onChange({ ...filters, places: filters.places.filter((p) => p !== place) }),
    });
  }
  for (const type of filters.contains) {
    const label = BLOCKS.find((b) => b.type === type)?.label ?? type;
    chips.push({
      key: `contains:${type}`,
      label: `With ${label.toLowerCase()}`,
      onRemove: () => onChange({ ...filters, contains: filters.contains.filter((t) => t !== type) }),
    });
  }
  for (const label of filters.labels) {
    chips.push({
      key: `label:${label}`,
      label: `Label: ${label}`,
      onRemove: () => onChange({ ...filters, labels: filters.labels.filter((l) => l !== label) }),
    });
  }
  if (filters.from) {
    const range = filters.to ? `${date(filters.from)} – ${date(filters.to)}` : date(filters.from);
    chips.push({
      key: "dates",
      label: `Dates: ${range}`,
      onRemove: () => onChange({ ...filters, from: undefined, to: undefined }),
    });
  }
  for (const id of filters.authors) {
    const name = people.find((p) => p.id === id)?.name ?? "Anonymous";
    chips.push({
      key: `author:${id}`,
      label: `By ${name === "You" ? "you" : name}`,
      onRemove: () => onChange({ ...filters, authors: filters.authors.filter((a) => a !== id) }),
    });
  }
  if (filters.agents !== "any") {
    chips.push({
      key: "agents",
      label: filters.agents === "only" ? "Agents only" : "People only",
      onRemove: () => onChange({ ...filters, agents: "any" }),
    });
  }
  return chips;
}

function FilterChips({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
