# Progress

What has landed, newest first. One line per change; the PR has the detail.

## 2026-10-12

- **Journal (PR #35, open, stacked on #34).** The canvas comes back as a journal of A4 pages, made for you: a cover, then a page for each moment as it is added, laid out like a scrapbook (taped prints, typed notes, Dada and ransom titles, postmarks, tickets, a map of the moment's stops that plays). Make mode moves, sizes and turns anything with snapping, retypes titles in seven styles, adds 15 kinds of ephemera, locks a page or the whole journal, cuts stickers out of photos on the device (MediaPipe), and exports an A4 PDF, a page as a picture, or a journal file to add back. Read mode turns it like a book. The experience's sections (Moments, Journal, Shared, Activity) moved from tabs into the sidebar.
- **Simplification, part A (PR #34, open).** The product is cut back to one way in and one way out: Add photos or a sentence in the box; a story scroll with the film behind Play. Gone: the canvas editor (its paper visuals stay for the story), MCP assistants, quota requests, the itinerary table with its filters, three views and bulk select, the review sheet, the "Add moment" form path and per-row menus. New: a plain timeline by day with search; the form edits and deletes one moment. Backend: five tables stop being written (removed in part A2), `MOMENT_LIMIT = 300` replaces per-experience limits, `http.ts` is empty (auth routes come from `convex.config.ts`).
- PR #33 (canvas enhancements) closed unmerged; its box restyle was redone in part A.
- Decided with Sara: scroll with film as Play; auto scrapbook with no editor; photos + one box; MCP, quota and itinerary filters go, Activity stays.

## 2026-10-11

- #32 Canvas tab, phase 1 (merged, not deployed).
- #31 Hint text under the box removed.
- #30 Voice (Whisper via the gateway) and photos in the box.
- #29 The box: add, change or remove moments from one sentence (Jev routes, Haiku plans).
- #28 BYO backend rule set (`docs/byo-backend.md`, proposal only).
- #27 Settings tabs on narrow screens. #26 Light/Dark/System switch in dark mode. #25 New logo.
- #21-#24 merged and deployed to production, with the description migration.

Nothing from #25 on is on the live site yet.
