import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { JournalElement } from "../../../convex/lib/journal";
import { errorMessage } from "@/lib/errors";

type PageId = Id<"journalPages">;
type Step = { pageId: PageId; before: { paper: string; elements: JournalElement[] }; after: { paper: string; elements: JournalElement[] } };

// The journal of an experience and every change to it. A change shows at once
// (an optimistic update) and is saved in the background; undo and redo replay
// a page as it was. A journal with moments that have no page yet is filled
// once it loads, for its owner.
export function useJournal(eventId: Id<"events">) {
  const data = useQuery(api.journal.get, { eventId });
  const fillPages = useMutation(api.journal.fill);
  const savePage = useMutation(api.journal.savePage).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.journal.get, { eventId });
    if (now === undefined) return;
    store.setQuery(api.journal.get, { eventId }, {
      ...now,
      pages: now.pages.map((p) =>
        p._id === args.pageId ? { ...p, paper: args.paper ?? p.paper, elements: args.elements.map((e) => ({ ...e, text: e.text })) } : p,
      ),
    });
  });
  const removePage = useMutation(api.journal.removePage).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.journal.get, { eventId });
    if (now !== undefined) store.setQuery(api.journal.get, { eventId }, { ...now, pages: now.pages.filter((p) => p._id !== args.pageId) });
  });
  const addPage = useMutation(api.journal.addPage);
  const movePage = useMutation(api.journal.movePage);
  const setLock = useMutation(api.journal.setLock);
  const importPages = useMutation(api.journal.importPages);

  const fail = useCallback((e: unknown) => toast.error(errorMessage(e)), []);

  // Pages for moments made since the last visit, made once per batch.
  const filling = useRef<number | null>(null);
  useEffect(() => {
    // Caught up: the next moment made is a new batch.
    if (data?.pending === 0) filling.current = null;
    if (!data?.canEdit || data.pending === 0 || filling.current === data.pending) return;
    filling.current = data.pending;
    fillPages({ eventId }).catch(fail);
  }, [data?.canEdit, data?.pending, eventId, fillPages, fail]);

  const pages = data?.pages;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const [, bump] = useState(0);

  // Writes a page, remembering how it was so it can be undone.
  const write = useCallback(
    (pageId: PageId, next: { paper?: string; elements: JournalElement[] }, record = true) => {
      const page = pagesRef.current?.find((p) => p._id === pageId);
      if (page === undefined) return;
      if (record) {
        past.current.push({ pageId, before: { paper: page.paper, elements: page.elements }, after: { paper: next.paper ?? page.paper, elements: next.elements } });
        if (past.current.length > 100) past.current.shift();
        future.current = [];
        bump((n) => n + 1);
      }
      savePage({ pageId, paper: next.paper, elements: next.elements.map(asArg) }).catch(fail);
    },
    [savePage, fail],
  );

  const undo = useCallback(() => {
    const step = past.current.pop();
    if (step === undefined) return;
    future.current.push(step);
    bump((n) => n + 1);
    savePage({ pageId: step.pageId, paper: step.before.paper, elements: step.before.elements.map(asArg) }).catch(fail);
  }, [savePage, fail]);
  const redo = useCallback(() => {
    const step = future.current.pop();
    if (step === undefined) return;
    past.current.push(step);
    bump((n) => n + 1);
    savePage({ pageId: step.pageId, paper: step.after.paper, elements: step.after.elements.map(asArg) }).catch(fail);
  }, [savePage, fail]);

  return {
    ready: data !== undefined,
    canEdit: (data?.canEdit ?? false) && !(data?.locked ?? false),
    owner: data?.canEdit ?? false,
    locked: data?.locked ?? false,
    filling: (data?.pending ?? 0) > 0 && (data?.canEdit ?? false),
    pages: pages ?? [],
    write,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    addPage: (after?: PageId, paper?: string) => addPage({ eventId, after, paper }).catch((e: unknown) => (fail(e), undefined)),
    removePage: (pageId: PageId) => removePage({ pageId }).catch(fail),
    movePage: (pageId: PageId, before: PageId | null) => movePage({ pageId, before }).catch(fail),
    lockPage: (pageId: PageId, locked: boolean) => setLock({ eventId, pageId, locked }).catch(fail),
    lockJournal: (locked: boolean) => setLock({ eventId, locked }).catch(fail),
    importPages: (list: Array<{ paper: string; elements: JournalElement[] }>) =>
      importPages({ eventId, pages: list.map((p) => ({ paper: p.paper, elements: p.elements.map(asArg) })) }),
  };
}

// An element as the server takes it: ids typed as the tables'.
export function asArg(e: JournalElement) {
  return { ...e, mediaId: e.mediaId as Id<"media"> | undefined, momentId: e.momentId as Id<"moments"> | undefined };
}

export type Journal = ReturnType<typeof useJournal>;
