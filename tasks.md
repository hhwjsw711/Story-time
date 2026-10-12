# Tasks

What is next, in order. Done items move to `progress.md`.

## Now

1. **Deploy** #34 and #35 to production: Convex first (`pnpm exec convex deploy --yes`), then the Worker. Before that (Sara): point the production Google and GitHub sign-in apps at `https://strong-stoat-772.convex.site/oauth/google/callback` and `/oauth/github/callback`, and look in the prod dashboard at the largest `momentCount` and the most media any one experience holds (the ceiling is now 300 moments and 1,500 photos per experience; 2 GB of live uploads per person still applies).
2. **Simplification A2**: clear `itinerary`, `canvases`, `canvasNodes`, `agentTokens`, `quotaRequests` in the dashboard (dev, then prod after the deploy), remove them from `convex/schema.ts`, push.
3. **Workers Builds** fail instantly on every PR: disconnect them in Cloudflare or send the build log.
4. **Journal, the next eight** (PR #36, `docs/next-features.md`, Cursor is building them): pages made when the moment is, the share link opens the book, one page on screen at a time, a page that can catch up, print a sitting, the cover keeps the trip's name, take a sticker back, Play is the same book. This covers the old "shared link shows the journal", the fun page titles, the tier list's second page and simplification B.

## Next

After the eight, in this order. Each one stays inside "photos or a sentence in, a book out": no feed, no like counts, no public profiles.

1. **Guestbook page** (medium). The last page of the book is a guestbook: people you invited leave a short note or a stamp; the owner sees them in Activity and can hide one. A `guestNotes` table (words encrypted), a viewer-role mutation, one extra page in the reader. Open: invited people only (suggested) or share-link readers too?
2. **On this day** (small, then medium). Home shows "A year ago today: Porto" with that day's journal page. Later an opt-in email in Settings that says only that a memory is waiting, with a link and no note text. A month-day field on moments with an index; a daily cron and the existing email component for the email. Open: home card only, or the email too?
3. **Home as a bookshelf** (small). Each experience's journal cover as a book on a shelf, opening in read mode, beside an "Everywhere we've been" mapcn map with a pin per trip. The events list returns each cover page (at most 20).
4. **The book as a video** (large). "Make a video": a day or the whole trip, square or 9:16, pages turning and the map drawing its route, as an MP4 for the phone's share sheet. Render the reader frame by frame (modern-screenshot, as the PDF does), encode with WebCodecs in a worker plus a small MP4 muxer, MediaRecorder where WebCodecs is missing. Risks: older Safari, memory on long trips, map tiles from other sites. Open: 9:16, square, or both?
5. **Photos with no signal** (medium to large). Install to the home screen; photos picked offline wait in a queue ("3 waiting") and upload when back online. A service worker on the existing `site.webmanifest`, an IndexedDB queue in `add-photos.ts`. Risks: iOS limits on installed web apps, storage quota.

## Later

- Voice clips on a page: ten seconds, kept as a tap-to-play sticker (a new audio media type).
- Ordering a printed book (payments and a print partner).
- BYO backend (`docs/byo-backend.md`): phase 0 groundwork, only on a go.
- Deferred audit items: S9, S11, S12, S13, S25, S26, S29, CARTO tiles.
- Narrow the `events.description` schema union once the description migration has run on prod.

## Rules that stay

- Private by default. No `any`. pnpm, never npx. Merge commits, not squash.
- Each PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `vp build` green before it opens.
- Update `progress.md` and this file in every PR.
