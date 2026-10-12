# Progress

What has landed, newest first. One line per change; the PR has the detail.

## 2026-10-12

- Journal review fixes (PR #39): a full book no longer skips moments that never got a page, a locked page stays put, a share link only fetches a sticker that is on a page, and a sticker can leave the shelf once every page lets it go.
- Deleting an experience also removes a connection token that was limited to it (PR #37). Account-wide tokens stay until A2. The 1,500 media ceiling is unchanged.
- **#34 and #35 merged** to master (not deployed yet). The local `story-time` MCP connector is removed. The next features are planned in `tasks.md`.
- **Moments page shows the journal (PR #35).** On a wide screen the space beside the list shows the picked moment's journal page, or the cover, with Play from here, Edit and Open in the journal (which opens on that page). On a phone a row still opens the editor or the story. The header lines up with the content.
- **Journal: zoom, draw, add anything (PR #35).** Zoom in and out (buttons, ⌘+/⌘−/⌘0, ctrl-scroll) and hold Space to pan. Draw with a pen, marker or highlighter in seven inks. Add pictures from the device by picking, dropping or pasting them. Paste or type a link and it becomes a card with its title and picture. 32 new stickers, food cut-outs among them (sushi, ramen, onigiri, dumpling, boba, ice cream, croissant, pretzel, beer, pizza). Page ideas: a type specimen, a Dada letterhead, a magazine spread, a photo wall, bits and pieces, a postcard, "What we did that day" (pick a day, get its moments in order with its photos), and a tier list of every place, every moment, or one moment's stops. Link addresses must be web addresses, checked on save.
- **Journal right-click menu (PR #35).** Right-click a thing for write, its style, tone, cut out a sticker, cut/copy/paste/duplicate, order (front, forward, backward, back), turn (straighten, tip, quarter turn), lock and delete; right-click bare paper to add something right there, paste there, change the paper, add a page, lock the page, save it as a picture or read. ⌘C, ⌘X and ⌘V work too.
- **Journal (PR #35).** The canvas comes back as a journal of A4 pages, made for you: a cover, then a page for each moment as it is added, laid out like a scrapbook (taped prints, typed notes, Dada and ransom titles, postmarks, tickets, a map of the moment's stops that plays). Make mode moves, sizes and turns anything with snapping, retypes titles in seven styles, adds 15 kinds of ephemera, locks a page or the whole journal, cuts stickers out of photos on the device (MediaPipe), and exports an A4 PDF, a page as a picture, or a journal file to add back. Read mode turns it like a book. The experience's sections (Moments, Journal, Shared, Activity) moved from tabs into the sidebar.
- **Simplification, part A (PR #34).** The product is cut back to one way in and one way out: Add photos or a sentence in the box; a story scroll with the film behind Play. Gone: the canvas editor (its paper visuals stay for the story), MCP assistants, quota requests, the itinerary table with its filters, three views and bulk select, the review sheet, the "Add moment" form path and per-row menus. New: a plain timeline by day with search; the form edits and deletes one moment. Backend: five tables stop being written (removed in part A2), `MOMENT_LIMIT = 300` replaces per-experience limits, `http.ts` is empty (auth routes come from `convex.config.ts`).
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
