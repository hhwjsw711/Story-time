# Tasks

What is next, in order. Done items move to `progress.md`.

## Now

1. **Simplification A**: merge PR #34 (verified on dev; checks green).
2. **Deploy A** to production: Convex first (`pnpm exec convex deploy --yes`), then the Worker. Needs the production Google and GitHub sign-in apps pointed at `https://strong-stoat-772.convex.site/oauth/google/callback` and `/oauth/github/callback` (Sara). First look in the prod dashboard at the largest `momentCount` and the most media any one experience holds: 300 moments and 1,500 photos per experience is the new ceiling (2 GB of live uploads per person still applies).
3. **Simplification A2**: clear `itinerary`, `canvases`, `canvasNodes`, `agentTokens`, `quotaRequests` in the dashboard (dev, then prod after A is live there), remove them from `convex/schema.ts`, push.
4. **Journal**: merge PR #35 after #34 (it is stacked on it). Dev has a test journal; prod gets the two new tables on deploy.
5. **Journal, next**: a page is cut with the moment, a share link opens that book, the strip is a contents by day, and a page catches up when its moment changes (a saved page waits for the button; a long tier list continues on the next page). Still to do: take a sticker back, Play is the same book. The cover follows the trip's name and dates until that line is retyped. Print a sitting is the export menu (this page, this day, the whole journal, and the whole journal says when it is a long one). A playful title suggestion can wait. Haiku page titles sit with those. A trip that already has unpaged moments gets those pages the next time a moment is added, or when a locked journal is unlocked.
6. **Simplification B**: the story scroll's day sections take the journal's paper look. Smaller now the journal exists; may merge into "the shared link shows the journal".

## Later

- Cloudflare Workers Builds fail instantly: disconnect them or send the build log.
- Remove the local `story-time` MCP connector once A is deployed (`claude mcp remove story-time`).
- BYO backend (`docs/byo-backend.md`): phase 0 groundwork, only on a go.
- Deferred audit items: S9, S11, S12, S13, S25, S26, S29, CARTO tiles.
- Narrow the `events.description` schema union once the description migration has run on prod.

## Rules that stay

- Private by default. No `any`. pnpm, never npx. Merge commits, not squash.
- Each PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `vp build` green before it opens.
- Update `progress.md` and this file in every PR.
