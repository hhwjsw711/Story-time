# Tasks

What is next, in order. Done items move to `progress.md`.

## Now

1. **Simplification A**: merge PR #34 (verified on dev; checks green).
2. **Deploy A** to production: Convex first (`pnpm exec convex deploy --yes`), then the Worker. Needs the production Google and GitHub sign-in apps pointed at `https://strong-stoat-772.convex.site/oauth/google/callback` and `/oauth/github/callback` (Sara).
3. **Simplification A2**: clear `itinerary`, `canvases`, `canvasNodes`, `agentTokens`, `quotaRequests` in the dashboard (dev, then prod after A is live there), remove them from `convex/schema.ts`, push.
4. **Journal**: merge its PR after #34 (it is stacked on it). Dev has a test journal; prod gets the two new tables on deploy.
5. **Journal, next**: the shared link shows the journal too (read-only book); Haiku offers fun page titles; a photo-less page still feels empty at the bottom when it has no ticket.
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
