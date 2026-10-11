# Story-time

Story-time collects everyone's photos from something you did together, in the order it happened. You start an experience, invite the people who were there with one-time links (or switch on a link anyone can watch from), and each of them adds their own moments. Story mode then plays it back stop by stop, with a typed title page, each leg on a map and the photos in a camera's viewfinder.

## Stack

- TanStack Start and Router (React 19), running on Cloudflare Workers. SSR is off; the server renders only the shell and its `<head>`.
- Convex for data and functions, Convex Auth for sign-in (GitHub and Google).
- Cloudflare R2 for photos and videos, encrypted with SSE-C keys derived per experience.
- Tailwind CSS v4 and shadcn/ui; three.js for the story camera, MapLibre for the map.

## Local setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then set ENCRYPTION_MASTER_KEY, e.g. openssl rand -base64 32
pnpm dev                         # convex dev + the app on http://localhost:3000
```

The first `pnpm dev` asks you to create or link a Convex deployment and writes `VITE_CONVEX_URL` to `.env.local`. `npx @convex-dev/auth` sets `AUTH_PRIVATE_KEY` and `AUTH_JWKS` on that deployment and leaves the existing `convex/` files alone.

Set these on the Convex deployment with `npx convex env set NAME value` (add `--prod` for production):

| Name | What it's for |
| --- | --- |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS` | Session signing keys |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `ENCRYPTION_MASTER_KEY` | Encrypts places, notes, links and feelings. Use the same value as the Worker's |
| `APP_URL` | The site's origin, used for invite and share links and allowed OAuth redirects. Several origins can be listed with commas (the first goes in invite and share links). Unset means `http://localhost:3000` |
| `ALLOW_ANONYMOUS_SIGNIN` | `true` enables the dev-only anonymous button. Never set it in production |
| `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, `EMAIL_FROM` | Optional. Without them invites are links only, no email |

AI features (captions, labels, transport) run through the Convex AI Gateway, which needs a paid Convex plan and no provider keys. For captions it gets the photos' 512px copies and the moment's text (experience title and description, places, time, transport, labels, notes); for transport it gets the places and times between stops. None of it is kept in Convex. Without the gateway the app works, just without the automatic fill-ins.

Place search and the names of photo locations use OpenStreetMap data from photon.komoot.io; your typed text or the photo's coordinates are sent to it.

On the client, `VITE_APP_URL` (the site's origin, set at build time) makes the link-preview image URL absolute. Crawlers ignore relative `og:image` URLs.

## Connect an assistant (MCP)

Claude Code, Claude Desktop and other [MCP](https://modelcontextprotocol.io) clients can read an experience's moments, and add or update moments for you. Make a connection on Settings, then Agents: name it, choose whether it may use all your experiences or one of them, and paste the setup the page shows. The token is shown once. If you lose it, disconnect that connection and make a new one. Tokens are stored only as a keyed hash.

The endpoint is your Convex site address with `/mcp` on the end:

```
https://<deployment>.convex.site/mcp
```

Claude Code:

```bash
claude mcp add --transport http story-time https://<deployment>.convex.site/mcp --header "Authorization: Bearer <token>"
```

Any other client that takes an HTTP MCP server:

```json
{
  "mcpServers": {
    "story-time": {
      "type": "http",
      "url": "https://<deployment>.convex.site/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The Agents page works the address out from `VITE_CONVEX_URL`. If that isn't a `.convex.cloud` address, such as a local deployment, the page asks for the site address instead.

| Tool | What it does |
| --- | --- |
| `list_experiences` | Lists the experiences the assistant can add to. Call it first. |
| `list_moments` | Reads the most recent moments of one experience, newest first. |
| `add_moment` | Adds a moment: when, where, a note or feeling, links, labels and up to nine more stops. Photos and videos are added in the app. |
| `update_moment` | Changes a moment's time, place, transport or labels, or adds a note to it. Nothing is deleted. |

An assistant acts for you, so it can do only what you could do. It can add to the experiences you own or help with, and change moments you added yourself, or any moment in an experience you own. Viewers can't add or change anything. Everything it adds or changes is labelled with its name, so you can always tell it from your own writing, and you can edit or remove any of it in the app. A connection can be limited to one experience, can make 60 requests a minute, and you can hold up to 10 connections at once.

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Convex dev deployment plus the app on port 3000 |
| `pnpm dev:web` | The app only |
| `pnpm build` | Production build |
| `pnpm preview` | Serve the build locally |
| `pnpm test` | Vitest: Convex functions (convex-test) and `src/lib` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm generate-routes` | Regenerate `src/routeTree.gen.ts` |
| `pnpm typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

## Deploy

1. `npx convex deploy`, then set the Convex variables above with `--prod`, including `APP_URL`.
2. Point each OAuth app's callback at `https://<deployment>.convex.site/oauth/github/callback` and `https://<deployment>.convex.site/oauth/google/callback`.
3. `npx wrangler r2 bucket create story-time-media` (bound as `MEDIA` in `wrangler.jsonc`).
4. `npx wrangler secret put ENCRYPTION_MASTER_KEY`, the same value Convex has.
5. Build against production: `VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_APP_URL=https://<your site> pnpm build`.
6. `npx wrangler deploy`.

## Layout

```
src/routes/          pages; _app/ is the signed-in app, api/ the Worker's upload and media endpoints
src/components/      ui/ (shadcn, generated), event/, story/ (story mode), landing/, settings/
src/server/r2.ts     R2 access and SSE-C key derivation for the Worker
src/lib/             shared helpers and their tests
convex/              schema, functions, crons; components/ holds email and invites; tests/
public/              favicon, link-preview image, robots.txt, web manifest
```
