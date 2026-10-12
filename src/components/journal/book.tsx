import { useQuery } from "convex/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileDownIcon,
  FileUpIcon,
  ImageDownIcon,
  LockIcon,
  PencilRulerIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
  UnlockIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { newId, placed, type NewThing } from "./add";
import { StickerCutter } from "./cutter";
import { PageEditor, writable } from "./editor";
import { download, fileName, journalFile, journalPdf, pagePng, readJournalFile } from "./export";
import { FONTS, GRAIN, paperLook } from "./look";
import { JournalPage, type PageData } from "./page";
import { AddTray, Inspector } from "./panel";
import { Reader } from "./reader";
import { useJournal } from "./use-journal";

type PageId = Id<"journalPages">;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select") !== null);

// The journal of an experience: its pages down the side, the open page in the
// middle, and what to add (or what to do with the picked thing) on the right.
// Read turns it into a book; the menu prints it, saves it as a file, or brings
// one back.
export function JournalBook({ event }: { event: EventView }) {
  const journal = useJournal(event._id);
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const stickers = useQuery(api.journal.stickers, { eventId: event._id }) ?? [];
  const momentById = useMemo(() => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])), [moments]);
  const photos = useMemo(
    () => (moments ?? []).flatMap((m) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat().flatMap((b) => (b.type === "photo" ? [b.mediaId as string] : []))),
    [moments],
  );

  // The page wants the room: the app's sidebar folds to its icons while the
  // journal is open, and comes back after.
  const sidebar = useSidebar();
  const folded = useRef(false);
  useEffect(() => {
    if (sidebar.open && !sidebar.isMobile && window.innerWidth < 1700) {
      folded.current = true;
      sidebar.setOpen(false);
    }
    return () => {
      if (folded.current) sidebar.setOpen(true);
    };
    // Once, when the journal opens.
  }, []);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  // Read or make: owners make by default, everyone else reads.
  const [mode, setMode] = useState<"read" | "make" | null>(null);
  const reading = mode === null ? !journal.owner : mode === "read" || !journal.owner;
  const setReading = (read: boolean) => setMode(read ? "read" : "make");
  const [cutting, setCutting] = useState<{ open: boolean; photo?: string }>({ open: false });
  const [removing, setRemoving] = useState<PageId | null>(null);
  // The panel as a sheet, on a phone.
  const [sheet, setSheet] = useState(false);
  const [printing, setPrinting] = useState<{ index: number; done: number } | null>(null);
  const importer = useRef<HTMLInputElement>(null);

  const pages = journal.pages as PageData[];
  const page = pages[Math.min(index, pages.length - 1)];
  const editable = journal.canEdit && page !== undefined && !page.locked && !reading;
  const chosen = page?.elements.find((e) => e.id === selected);

  // The middle column's size, for fitting the page into it.
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 900 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reading]);
  const scale = Math.max(0.2, Math.min((size.w - 32) / PAGE.w, (size.h - 32) / PAGE.h));

  useEffect(() => {
    setSelected(null);
    setWriting(null);
  }, [index]);

  const change = useCallback(
    (elements: JournalElement[], paper?: string) => {
      if (page) journal.write(page._id as PageId, { elements, paper });
    },
    [journal, page],
  );
  const changeOne = (id: string, patch: Partial<JournalElement>) =>
    page && change(page.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const add = (thing: NewThing) => {
    if (!page || !editable) return;
    const id = newId();
    change([...page.elements, placed(thing, page.elements, id)]);
    setSelected(id);
  };
  const remove = () => {
    if (!page || !selected) return;
    change(page.elements.filter((e) => e.id !== selected));
    setSelected(null);
  };
  const duplicate = () => {
    if (!page || !chosen) return;
    const id = newId();
    change([...page.elements, { ...chosen, id, x: chosen.x + 24, y: chosen.y + 24, z: Math.max(...page.elements.map((e) => e.z)) + 1, locked: undefined }]);
    setSelected(id);
  };
  const restack = (to: "front" | "back") => {
    if (!page || !chosen) return;
    const zs = page.elements.map((e) => e.z);
    changeOne(chosen.id, { z: to === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
  };

  // The keys, while the journal is open and nobody is typing.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (typing(e.target) || reading || !journal.canEdit) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) journal.redo();
        else journal.undo();
      } else if (!editable || !chosen) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if (e.key === "Enter" && writable(chosen)) {
        e.preventDefault();
        setWriting(chosen.id);
      } else if (e.key === "]" || e.key === "[") {
        restack(e.key === "]" ? "front" : "back");
      } else if (e.key.startsWith("Arrow") && !chosen.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        changeOne(chosen.id, { x: chosen.x + dx, y: chosen.y + dy });
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  // ---- Paper out ----------------------------------------------------------------

  const offstage = useRef<HTMLDivElement>(null);
  async function printPdf() {
    if (pages.length === 0) return;
    setPrinting({ index: 0, done: 0 });
    try {
      const blob = await journalPdf(
        pages.length,
        async (i) => {
          setPrinting({ index: i, done: i });
          // Drawn on the next frame, at full size, out of sight.
          await new Promise((r) => setTimeout(r, 120));
          const node = offstage.current?.querySelector<HTMLElement>("[data-journal-page]");
          if (!node) throw new Error("The page couldn't be drawn.");
          return { node, hasMap: pages[i]!.elements.some((e) => e.kind === "map"), paper: paperLook(pages[i]!.paper).color };
        },
        (done) => setPrinting((p) => (p ? { ...p, done } : p)),
      );
      download(blob, `${fileName(event.title)}.pdf`);
      toast.success("Your journal is ready");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPrinting(null);
    }
  }
  async function printPage() {
    if (!page) return;
    setPrinting({ index, done: 0 });
    try {
      await new Promise((r) => setTimeout(r, 120));
      const node = offstage.current?.querySelector<HTMLElement>("[data-journal-page]");
      if (!node) throw new Error("The page couldn't be drawn.");
      download(
        await pagePng({ node, hasMap: page.elements.some((e) => e.kind === "map"), paper: paperLook(page.paper).color }),
        `${fileName(event.title)}-page-${index + 1}.png`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPrinting(null);
    }
  }
  async function bringBack(file: File | undefined) {
    if (!file) return;
    try {
      const list = await readJournalFile(file);
      if (list.length === 0) throw new Error("That file has no pages.");
      const n = await journal.importPages(list);
      toast.success(`Added ${n === 1 ? "a page" : `${n} pages`} at the end`);
      setIndex(pages.length);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ---- The page -------------------------------------------------------------------

  if (!journal.ready || moments === undefined) {
    return <div className="grid h-[calc(100svh-12rem)] place-items-center text-stone-500">Opening the journal…</div>;
  }
  if (pages.length === 0) {
    return (
      <div className="paper-scope grid h-[calc(100svh-12rem)] place-items-center rounded-xl bg-[#e9dfcb] text-center text-[#1f1a16]" style={{ backgroundImage: GRAIN }}>
        <div className="space-y-2">
          <p style={{ fontFamily: FONTS.hand, fontSize: 34 }}>{journal.filling ? "Cutting and pasting your pages…" : "No journal yet"}</p>
          <p className="text-sm text-stone-600">
            {journal.owner ? "Every moment gets a page of its own." : "Its owner hasn't started the journal yet."}
          </p>
        </div>
      </div>
    );
  }

  const pageId = page!._id as PageId;
  const at = Math.min(index, pages.length - 1);

  // What to add, or what to do with the picked thing: the right column on a
  // wide screen, a sheet from the bottom on a phone.
  const panel = !editable ? (
    <p className="px-3 py-4 text-sm text-stone-600">
      {journal.locked
        ? "The journal is locked. Unlock it to change it."
        : page?.locked
          ? "This page is locked. Unlock it to change it."
          : "Only the experience's owner can change the journal."}
    </p>
  ) : chosen ? (
    <Inspector
      e={chosen}
      onChange={(patch) => changeOne(chosen.id, patch)}
      onWrite={() => setWriting(chosen.id)}
      onRestack={restack}
      onDuplicate={duplicate}
      onDelete={remove}
      onCut={() => setCutting({ open: true, photo: chosen.mediaId })}
    />
  ) : (
    <AddTray
      moments={moments}
      stickers={stickers}
      paper={page!.paper}
      onAdd={(thing) => {
        add(thing);
        setSheet(false);
      }}
      onPaper={(paper) => change(page!.elements, paper)}
      onCut={() => setCutting({ open: true })}
    />
  );

  return (
    <div className="paper-scope flex h-[calc(100svh-9.5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-stone-300 bg-[#e9dfcb] text-[#1f1a16]" style={{ backgroundImage: GRAIN }}>
      {/* The toolbar. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-300/80 bg-[#f3ead6]/90 px-2 py-1.5">
        <h2 className="mr-2 truncate text-2xl leading-none" style={{ fontFamily: FONTS.hand }}>
          {at === 0 ? "Cover" : `Page ${at}`}
        </h2>
        {journal.owner && (
          <div className="flex items-center rounded-lg bg-white/60 p-0.5">
            <Button size="sm" variant={reading ? "ghost" : "default"} onClick={() => setReading(false)}>
              <PencilRulerIcon aria-hidden /> Make
            </Button>
            <Button size="sm" variant={reading ? "default" : "ghost"} onClick={() => setReading(true)}>
              <BookOpenIcon aria-hidden /> Read
            </Button>
          </div>
        )}
        {!reading && journal.canEdit && (
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo (⌘Z)" disabled={!journal.canUndo} onClick={journal.undo}>
              <Undo2Icon aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!journal.canRedo} onClick={journal.redo}>
              <Redo2Icon aria-hidden />
            </Button>
          </>
        )}
        {/* On a phone the page strip and the panel are folded away: arrows turn
            the pages, and the panel opens as a sheet. */}
        {!reading && (
          <div className="flex items-center gap-0.5 sm:hidden">
            <Button size="icon-sm" variant="ghost" aria-label="The page before" disabled={at === 0} onClick={() => setIndex(at - 1)}>
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="The page after" disabled={at === pages.length - 1} onClick={() => setIndex(at + 1)}>
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        )}
        {!reading && journal.canEdit && (
          <Button size="sm" variant="outline" className="md:hidden" onClick={() => setSheet(true)}>
            {chosen ? <SlidersHorizontalIcon aria-hidden /> : <PlusIcon aria-hidden />} {chosen ? "Edit" : "Add"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {journal.owner && (
            <Button
              size="sm"
              variant={journal.locked ? "default" : "ghost"}
              title={journal.locked ? "Unlock the journal" : "Lock the whole journal, so nothing moves"}
              onClick={() => void journal.lockJournal(!journal.locked)}
            >
              {journal.locked ? <LockIcon aria-hidden /> : <UnlockIcon aria-hidden />} {journal.locked ? "Locked" : "Lock"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={printing !== null}>
                <DownloadIcon aria-hidden /> {printing ? `Printing ${printing.done}/${pages.length}…` : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              <DropdownMenuItem onSelect={() => void printPdf()}>
                <FileDownIcon /> The journal as an A4 PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void printPage()}>
                <ImageDownIcon /> This page as a picture
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => download(journalFile(event.title, pages), `${fileName(event.title)}.journal.json`)}>
                <DownloadIcon /> Save a journal file
              </DropdownMenuItem>
              {journal.canEdit && (
                <DropdownMenuItem onSelect={() => importer.current?.click()}>
                  <FileUpIcon /> Add pages from a journal file
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={importer}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void bringBack(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* The pages, as a strip of thumbnails. */}
        {!reading && (
          <nav aria-label="Pages" className="hidden w-28 shrink-0 flex-col gap-2 overflow-y-auto border-r border-stone-300/80 bg-[#efe6d2]/80 p-2 sm:flex">
            {pages.map((p, i) => (
              <div key={p._id} className="group relative">
                <button
                  type="button"
                  aria-label={i === 0 ? "Cover" : `Page ${i}`}
                  aria-current={i === at ? "page" : undefined}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "block overflow-hidden rounded-sm shadow-sm ring-offset-2 ring-offset-[#efe6d2] transition hover:-translate-y-0.5",
                    i === at ? "ring-2 ring-[#c4552f]" : "ring-1 ring-stone-300",
                  )}
                >
                  <JournalPage page={p} moments={momentById} scale={88 / PAGE.w} live={false} />
                </button>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-stone-600">
                  <span style={{ fontFamily: FONTS.typewriter }}>{i === 0 ? "cover" : i}</span>
                  {p.locked && <LockIcon aria-label="Locked" className="size-3" />}
                </div>
              </div>
            ))}
            {journal.canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="border-dashed"
                onClick={() => void journal.addPage(pageId).then((id) => id && setIndex(at + 1))}
              >
                <PlusIcon aria-hidden /> Page
              </Button>
            )}
          </nav>
        )}

        {/* The open page, or the book. */}
        <div ref={stage} className="relative min-w-0 flex-1 overflow-auto">
          {reading ? (
            <Reader pages={pages} moments={momentById} size={size} start={at} onPage={setIndex} />
          ) : (
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="shadow-[0_18px_40px_rgba(40,28,10,.32)]">
                <PageEditor
                  page={page!}
                  moments={momentById}
                  scale={scale}
                  editable={editable}
                  selected={selected}
                  writing={writing}
                  onSelect={setSelected}
                  onWrite={setWriting}
                  onChange={(els) => change(els)}
                />
              </div>
            </div>
          )}
        </div>

        {/* What to add, or what to do with the picked thing. */}
        {!reading && (
          <aside aria-label={chosen ? "The picked thing" : "Things to add"} className="hidden w-64 shrink-0 xl:w-72 overflow-y-auto border-l border-stone-300/80 bg-[#f3ead6]/90 md:block">
            {journal.canEdit && page && (
              <div className="flex flex-wrap items-center gap-1 border-b border-stone-300/70 px-3 py-2">
                <span className="mr-auto font-mono text-[11px] tracking-[0.14em] text-stone-500 uppercase">This page</span>
                <Button size="icon-sm" variant="ghost" aria-label="Move it earlier" disabled={at === 0} onClick={() => void journal.movePage(pageId, pages[at - 1]!._id as PageId).then(() => setIndex(at - 1))}>
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move it later"
                  disabled={at === pages.length - 1}
                  onClick={() => void journal.movePage(pageId, (pages[at + 2]?._id as PageId | undefined) ?? null).then(() => setIndex(at + 1))}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button size="icon-sm" variant={page.locked ? "default" : "ghost"} aria-label={page.locked ? "Unlock this page" : "Lock this page"} title={page.locked ? "Unlock this page" : "Lock this page"} onClick={() => void journal.lockPage(pageId, !page.locked)}>
                  {page.locked ? <LockIcon aria-hidden /> : <UnlockIcon aria-hidden />}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Take this page out" className="text-destructive" disabled={page.locked} onClick={() => setRemoving(pageId)}>
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
            )}
            {panel}
          </aside>
        )}
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="paper-scope max-h-[75svh] overflow-y-auto bg-[#f3ead6] p-0 text-[#1f1a16]">
          <SheetHeader className="pb-0">
            <SheetTitle style={{ fontFamily: FONTS.hand, fontSize: 26, fontWeight: 400 }}>{chosen ? "The picked thing" : "Add to the page"}</SheetTitle>
            <SheetDescription className="sr-only">{chosen ? "Change or remove what is picked." : "Things to put on this page."}</SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
      <StickerCutter
        eventId={event._id}
        photos={photos}
        start={cutting.photo}
        open={cutting.open}
        onOpenChange={(open) => setCutting((c) => ({ ...c, open }))}
        onMade={(mediaId) => add({ kind: "sticker", mediaId, w: 0, h: 0 })}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Take this page out?"
        description="Everything on it goes with it. Its moment stays in the experience."
        confirmLabel="Take it out"
        onConfirm={async () => {
          if (removing) await journal.removePage(removing);
          setIndex(Math.max(0, at - 1));
          setRemoving(null);
        }}
      />
      {/* Pages drawn at full size, out of sight, for printing. */}
      {printing !== null &&
        createPortal(
          <div ref={offstage} aria-hidden className="pointer-events-none fixed top-0 -left-[3000px]">
            <JournalPage page={pages[printing.index]!} moments={momentById} scale={1} />
          </div>,
          document.body,
        )}
    </div>
  );
}
