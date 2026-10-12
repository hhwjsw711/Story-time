# What to build next

Written 2026-10-12 against `journal` at `618d3fb` (PR #35, stacked on the simplification in PR #34). Docs only. Nothing here is built.

The product Sara settled on is still the right shape: photos in, or one sentence in the box, and a story out. The journal is that story as a book of A4 pages, made like a scrapbook. These eight stay inside that. They do not bring back a freeform canvas, assistants, quota requests, bulk edit, or filters.

Order is the order to build them. Each one is usable on its own. Sizes are how much of the system moves: **small** is one mutation and a control, **medium** is a query plus a screen, or a change that crosses moments and the journal.

Two bugs in #35 should land before 1 and 2, because those features stand on them. `fill` sets `filledAt` to the newest moment even when the book was full and the page was never made, so a skipped moment looks the same as a page the owner took out. And `mediaForShare` already returns every sticker to a share token, while the share page does not show the book yet.

## 1. Make the page when the moment is made

**Problem.** A page appears only when the owner's browser calls `fill`. A moment added from the box, or by someone else on the trip, has no page until the owner opens the journal. The new sidebar then draws a pretend page (`momentPage` on the client) for a layout the book does not contain.

**How it should feel.** Nothing new to tap. Add a photo, and the book already has that day. If the book is full (400 pages), the moments list says so in one line, next to that moment, instead of showing a page that will never be kept.

**How.** Schedule an internal mutation from the moment write, one page per moment, idempotent on `by_event_and_moment`. The cover is created with the first moment, not on a later visit. Do not decrypt and insert an entire trip inside `create`. Batch the way `purgeEventData` already batches deletes. `filledAt` advances only over moments that received a page or already had one.

**Size.** Medium. One internal mutation, a call from `createMoment`, and a delete of the client `fill` effect once the server is the one doing it.

**Risks.** A locked journal should refuse the new page and leave `pending` honest. Generating inside the create transaction will blow the write limit on a big import of photos; the scheduled batch is the point.

## 2. The share link opens the book

**Problem.** The thing a person would hand over is the scrapbook. The link still plays the older story, and a token can already fetch sticker bytes for cut-outs that story never shows.

**How it should feel.** The shared page is the reader that already exists: pages turn, the paper is the paper, nothing is draggable. "Play" can stay as a second button for the film. No shelf of unused stickers, no make tools, no right-click. A phone gets one page and the turn buttons, which the reader already does.

**How.** A share query with the same shape as `journal.get`, authorized by the token the way `mediaForShare` already is, reusing `viewPage` so words are decrypted only for that token. Return a sticker's bytes only when a page of this experience actually references that media id. Point the shared route at the reader.

**Size.** Medium. One query, the existing reader, and a tightening of `mediaForShare`. The test that is missing belongs here: a token reads a sticker that is on a page, and does not read a loose upload or another trip's sticker.

**Risks.** Decrypting every page for an unauthenticated read is the same cost as `journal.get` (feature 3 makes this one page at a time). The journal file export is plaintext on purpose; the share link should keep serving decrypted text only through the query, never as a download of the table.

## 3. One page on screen

**Problem.** Opening the journal, or the moments list, subscribes to every page and decrypts every word. The thumbnail strip mounts a full A4 tree per page and decodes every photo. The sidebar preview does this even on a phone, where it is hidden, and a journey mounts a live map beside the list.

**How it should feel.** The strip is a contents, grouped by day the way the moments list already is: "Wed 3 Jun", then the pages of that day, with the open one marked. Thumbnails draw for the open spread and its neighbours. The sidebar shows the saved page for the picked moment, or a quiet "this moment has no page" if it was taken out. It does not invent one.

**How.** Split `journal.get` into a contents query (id, order, momentId, a short label) and a single-page query. The optimistic save in `useJournal` stays, scoped to the open page. Pass `live={false}` anywhere that is not the open page, and stub photos the same way maps are already stubbed. The moments route should not subscribe to the book on a narrow screen.

**Size.** Medium. The read path and the strip. Make mode's tools stay as they are.

**Risks.** More round trips than one big query. Worth it once a trip has more than a handful of days. Labels for the contents can be the title element already on the page; keep that decryption to one short string per page, not every note.

## 4. A page that can catch up

**Problem.** The page is a copy made at fill time. A better note, or another photo, leaves the scrapbook behind. Deleting the moment leaves the page in the book, and viewers lose the photos: detach clears `momentId`, and only stickers are visible without one. The owner still sees them, because they uploaded them. Everyone else sees a broken print.

**How it should feel.** On a moment's page that has not been rearranged, a single line: "The moment changed." One button, "Update this page", rebuilds the prints and the note and leaves anything the owner added (a drawing, a sticker, a title they retyped). If the moment was deleted, the page says so and offers "Take this page out", which already exists. No surprise rewrite of a page someone has taped and moved.

**How.** Remember, on the page, the moment time it was built from. If the owner has saved the page since, the button is the only way it updates, and the generated pieces (ids that `momentPage` still uses) are the ones replaced. If they have not saved it, updating can be the default the next time the book opens. Do not flip detached photos to `purpose: "sticker"` just so viewers can see them; that would publish them on the share link. A grey print with "This photo was removed" is the honest picture.

**Size.** Medium. A field on `journalPages`, a branch in `fill` or a small `refreshPage` mutation, and the line in the page chrome.

**Risks.** Merging a handmade page with a new layout is where scrapbook editors get hated. Start with "only if the owner has not touched it", and make the button explicit after that. The tier list already drops items that do not fit under the rows; a second page for "still to rank" (already noted in `tasks.md`) is the same idea of not pretending the page holds what it does not, and it is small enough to do beside this.

## 5. Print a sitting

**Problem.** Export walks every page into one PDF: a 2× JPEG at quality 0.9, up to 400 of them, held in the tab until the end. Map tiles and link pictures come from other sites, so they print blank. The offstage page is swapped and then waited on for 120ms, which can photograph the previous page.

**How it should feel.** The menu offers "This page", "This day", and "The whole journal". The whole journal says how many pages it is before it starts, and past a few dozen it is the unusual choice. Progress stays the count that is already there. A map that cannot fetch its tiles prints as the postcard with the place names, which are already on the page. Stickers sit on the paper colour; JPEG will flatten them, and that is acceptable if the colour is the paper.

**How.** `journalPdf` already takes a count and a draw function. Pass it a slice. Wait for the committed node (a ref callback, or two frames) instead of 120ms. Hide play buttons the way `data-export-hide` already does, and draw the map's place list into the export when the tiles are not same-origin.

**Size.** Small. The export module and the menu. No schema change.

**Risks.** A determined whole-book export of a long trip can still be heavy. The menu's default should be the sitting, so that path is the rare one.

## 6. The cover keeps the trip's name

**Problem.** The cover is written once, from the title at first fill. Renaming the experience, or setting its dates, leaves "Untitled experience" on the front of the book. The title on a moment page is the place name, which is sturdy and a bit plain; `tasks.md` already asks for a more playful line.

**How it should feel.** Until someone retypes the cover, it follows the trip's name and dates. The moment they edit it, it is theirs and stays. A moment page can offer one other title ("Try another"), from the same caption path the photos already use, shown as a suggestion under the title rather than a silent replacement. Seven styles are already there; the words change, the style stays unless they pick another.

**How.** The cover title element id is already stable (`cover-…`). `events.update` patches that element only while its text still equals the previous title. A suggestion is one action call, owner-only, rate-limited like `linkPreview`, writing through `savePage` so the words are encrypted like every other title. Do not store the suggestion in the clear.

**Size.** Small for the cover. Small again for the suggestion, and it can wait until the cover is true.

**Risks.** Patching the cover from `events.update` must no-op once the owner has edited that element, or a rename wipes a handmade front. The model sees the place and the note in the action, the same way captions already do; the stored page stays ciphertext.

## 7. Take a sticker back

**Problem.** A cut-out is permanent. Lifting it off a page leaves it on the shelf, and (until feature 2 tightens the check) a share token that knows the id can still fetch it. The cutter also only works with a pointer: the buttons are reachable from a keyboard, and the point on the photo is not.

**How it should feel.** Each sticker on the shelf has a small remove, refused with one sentence if a page still uses it. The cutter opens with the point in the middle of the photo. Arrow keys nudge it, tap still works, and the dialog says, in the same words as Settings, that the model is Google's and the photo stays on the device until "Keep this sticker". The first open downloads a large file; the spinner can say so.

**How.** `dropSticker` checks the owner, `purpose === "sticker"`, and that no page's elements reference the id (400 pages is a bounded read), then uses the existing media delete and the R2 delete the moment form already calls. The wasm import stays dynamic so the first page of the app does not carry the 13 MB binary. The float16 model is the thing to try if the edge is still clean.

**Size.** Small. One mutation, a control on the shelf, and a keyboard point in the cutter.

**Risks.** Scanning every page for one media id is fine at this cap and is the wrong shape if pages ever grow past it. A sticker used on two pages must survive removing it from one.

## 8. Play is the same book

**Problem.** Play and the journal are two drawings of the same days, and they will drift. `tasks.md` already calls this simplification B, and says it may fold into "the shared link shows the journal".

**How it should feel.** "Play from here" opens the reader at that moment's page. The film can stay behind the first spread, since that is the part of Play people already know. Turning the page is the story. Make mode is a separate choice, as it is now. A moment that has no page yet (the book was full, or the page was taken out) falls back to the current story block, so an older trip does not go blank.

**How.** The story route renders the reader, starting at `momentId`, once feature 3 can load that page alone. Keep the map's play button; it already lives on the journal map. Retire a memoir section only where a journal page exists.

**Size.** Medium, and smaller if feature 2 has already put the reader on the share link. Do this last, so Play moves onto a book that is complete, shareable, and cheap to open.

**Risks.** The story scroll has details the journal page does not (every stop, the full note when the page clipped it). The fallback block covers a missing page; a page that clipped the note should still offer "Read the moment" into that block, so Play does not become the shorter copy.

## What this leaves alone

- Contributors keep adding moments. They do not co-edit the book. The owner makes it; everyone else reads it. That is the simplification.
- No new tables beyond a field or two on `journalPages`.
- No second editor. Make mode, the reader, and the moments list are the three surfaces.
- BYO backend stays a proposal (`docs/byo-backend.md`). None of the above needs it.
