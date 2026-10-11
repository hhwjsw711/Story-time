# Story-time

Story-time collects everyone's photos from something you did together, in the order it happened. You start an experience, invite the people who were there with one-time links, and each of them adds their own moments. Story mode then plays it back stop by stop, with a typed title page, each leg on a map and the photos in a camera's viewfinder.

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
| `APP_URL` | The site's origin, used for invite links and allowed OAuth redirects. Several origins can be listed with commas (the first goes in invite links). Unset means `http://localhost:3000` |
| `ALLOW_ANONYMOUS_SIGNIN` | `true` enables the dev-only anonymous button. Never set it in production |
| `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, `EMAIL_FROM` | Optional. Without them invites are links only, no email |

On the client, `VITE_APP_URL` (the site's origin, set at build time) makes the link-preview image URL absolute. Crawlers ignore relative `og:image` URLs.

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
