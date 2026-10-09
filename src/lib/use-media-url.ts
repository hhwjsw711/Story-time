import { useAuthToken } from "@convex-dev/auth/react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

type MediaState = { url: string | null; failed: boolean };
type Entry = { state: MediaState; users: Set<() => void>; abort: AbortController };

const IDLE: MediaState = { url: null, failed: false };

// Blob URLs by media id, least recently used first, so a picture shown again
// (the next scene, the feed after the story) appears at once. Keyed by id
// alone: a viewer only ever learns ids the server lets them see, and a fresh
// token mustn't refetch what's on screen.
// ponytail: keeps up to 40 blobs nobody is showing; raise it if revisits
// still flash, or move to the Cache API if memory becomes the problem.
const MAX = 40;
const cache = new Map<string, Entry>();

function load(mediaId: string, token: string | null): Entry | undefined {
  const hit = cache.get(mediaId);
  cache.delete(mediaId);
  // A failure is retried once nobody is showing it.
  if (hit && !(hit.state.failed && hit.users.size === 0)) {
    cache.set(mediaId, hit);
    return hit;
  }
  if (!token) return undefined;
  const entry: Entry = { state: IDLE, users: new Set(), abort: new AbortController() };
  cache.set(mediaId, entry);
  const settle = (state: MediaState) => {
    entry.state = state;
    for (const notify of entry.users) notify();
  };
  fetch(`/api/media/${mediaId}`, { headers: { Authorization: `Bearer ${token}` }, signal: entry.abort.signal })
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

// Private media can't use a plain <img src>, so fetch it with the viewer's
// token and hand back a blob URL. `failed` is set when it can't be shown.
export function useMediaUrl(mediaId: string | undefined): MediaState {
  const token = useAuthToken();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const signedIn = token !== null;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!mediaId) return () => {};
      const entry = load(mediaId, tokenRef.current);
      entry?.users.add(notify);
      evict();
      return () => {
        entry?.users.delete(notify);
        evict();
      };
    },
    // Subscribes again once a token arrives, not each time it's refreshed.
    [mediaId, signedIn],
  );
  return useSyncExternalStore(subscribe, () => (mediaId && cache.get(mediaId)?.state) || IDLE, () => IDLE);
}

// Starts loading pictures that are about to be shown.
export function usePrefetchMedia(mediaIds: string[]) {
  const token = useAuthToken();
  const ids = mediaIds.join(" ");
  useEffect(() => {
    if (!ids) return;
    for (const id of ids.split(" ")) load(id, token);
    evict();
  }, [ids, token]);
}
