import { useAuthToken } from "@convex-dev/auth/react";
import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react";

type MediaState = { url: string | null; failed: boolean };
type Entry = { state: MediaState; users: Set<() => void>; abort: AbortController };

// Who is asking for a picture: the signed-in viewer ("bearer"), or someone who
// opened a share link ("share"), whose token is the only credential.
export type MediaAuth = { kind: "bearer" | "share"; token: string };

// A shared story provides its link's token. Without a provider, pictures are
// fetched with the signed-in viewer's session.
export const MediaAuthContext = createContext<MediaAuth | null>(null);

function useMediaAuth(): MediaAuth | null {
  const shared = useContext(MediaAuthContext);
  const token = useAuthToken();
  if (shared) return shared;
  return token ? { kind: "bearer", token } : null;
}

const IDLE: MediaState = { url: null, failed: false };

// Blob URLs by media id, least recently used first, so a picture shown again
// (the next scene, the feed after the story) appears at once. Keyed by id
// alone: a viewer only ever learns ids the server lets them see, and a fresh
// token mustn't refetch what's on screen.
// ponytail: keeps up to 40 blobs nobody is showing; raise it if revisits
// still flash, or move to the Cache API if memory becomes the problem.
const MAX = 40;
const cache = new Map<string, Entry>();

function load(mediaId: string, auth: MediaAuth | null): Entry | undefined {
  const hit = cache.get(mediaId);
  cache.delete(mediaId);
  // A failure is retried once nobody is showing it.
  if (hit && !(hit.state.failed && hit.users.size === 0)) {
    cache.set(mediaId, hit);
    return hit;
  }
  if (!auth) return undefined;
  const entry: Entry = { state: IDLE, users: new Set(), abort: new AbortController() };
  cache.set(mediaId, entry);
  const settle = (state: MediaState) => {
    entry.state = state;
    for (const notify of entry.users) notify();
  };
  const authorization = auth.kind === "share" ? `Share ${auth.token}` : `Bearer ${auth.token}`;
  fetch(`/api/media/${mediaId}`, { headers: { Authorization: authorization }, signal: entry.abort.signal })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
    .then((blob) => {
      if (!entry.abort.signal.aborted) settle({ url: URL.createObjectURL(blob), failed: false });
    })
    .catch(() => settle({ url: null, failed: true }));
  return entry;
}

// Drops the oldest entries nobody is showing; one still on screen keeps its URL.
function evict() {
  for (const [id, e] of cache) {
    if (cache.size <= MAX) return;
    if (e.users.size > 0) continue;
    e.abort.abort();
    if (e.state.url) URL.revokeObjectURL(e.state.url);
    cache.delete(id);
  }
}

// On sign-out: every picture leaves memory, so the next person at this browser
// can't see the last one's. Pictures on screen fall back to the placeholder.
export function clearMediaCache() {
  for (const [id, entry] of cache) {
    cache.delete(id);
    entry.abort.abort();
    if (entry.state.url) URL.revokeObjectURL(entry.state.url);
    entry.state = IDLE;
    for (const notify of entry.users) notify();
  }
}

// Private media can't use a plain <img src>, so fetch it with the viewer's
// token and hand back a blob URL. `failed` is set when it can't be shown.
export function useMediaUrl(mediaId: string | undefined): MediaState {
  const auth = useMediaAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  // Subscribes again once access arrives, not each time a token is refreshed.
  const kind = auth?.kind;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!mediaId) return () => {};
      const entry = load(mediaId, authRef.current);
      entry?.users.add(notify);
      evict();
      return () => {
        entry?.users.delete(notify);
        evict();
      };
    },
    [mediaId, kind],
  );
  return useSyncExternalStore(subscribe, () => (mediaId && cache.get(mediaId)?.state) || IDLE, () => IDLE);
}

// Starts loading pictures that are about to be shown.
export function usePrefetchMedia(mediaIds: string[]) {
  const auth = useMediaAuth();
  const ids = mediaIds.join(" ");
  // Taken apart, so the effect reruns for a new token rather than a new object.
  const kind = auth?.kind;
  const token = auth?.token;
  useEffect(() => {
    if (!ids || kind === undefined || token === undefined) return;
    for (const id of ids.split(" ")) load(id, { kind, token });
    evict();
  }, [ids, kind, token]);
}
