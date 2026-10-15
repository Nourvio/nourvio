# Stack

The rewrite is a chance to pick each layer again. The REFERENCE app's choices mostly held up, so most stay. The changes are where a library now does safely what we wrote by hand (sign-in, jobs, AI providers), or where open source raises the bar (a public API, many AI providers, contributors, translators).

Versions are what's current in October 2026. Pin exact versions in the lockfile and let Renovate propose updates (see [open-source.md](open-source.md#keeping-dependencies-healthy)).

## At a glance

| Layer | REFERENCE | Merran | Change? |
|---|---|---|---|
| Language | TypeScript (strict) | TypeScript (strict) | Keep |
| Runtime | Node 24, running `.ts` directly | Node 24 LTS, running `.ts` directly | Keep (move to Node 26 once it's LTS and our dependencies support it) |
| Monorepo | npm workspaces | **pnpm workspaces** | Change |
| Server | Hono | Hono, with **`@hono/zod-openapi`** | Keep, add OpenAPI |
| Validation | Zod | Zod 4 | Keep |
| Database | Postgres 18 | Postgres 18, and only Postgres | Keep |
| ORM | Drizzle + `pg` | Drizzle + `pg` | Keep |
| Sign-in and accounts | Written by hand (scrypt, sessions, invites, tokens) | **Better Auth** | Change |
| Background jobs | `setInterval` loops and job tables | **pg-boss** | Change |
| Live updates | Server-sent events | Server-sent events, fed by Postgres `LISTEN/NOTIFY` | Keep, small change |
| AI | Our own interface over `@anthropic-ai/sdk` and `openai` | **AI SDK 6** (`ai`), behind a thin Merran layer | Change |
| Model prices | A table in the shared package | A bundled model catalog, refreshed each release, with overrides | Change |
| Web app | React 19 + Vite | React 19 + Vite | Keep |
| Routing | React Router | **TanStack Router** | Change |
| Server data | TanStack Query | TanStack Query | Keep |
| API client | A hand-written `api()` | **Generated from the OpenAPI spec** (`openapi-typescript` + `openapi-fetch`) | Change |
| Components | shadcn/ui on Radix, Maia style, Tailwind v4 | shadcn/ui on **Base UI**, Maia style, Tailwind v4 | Keep shadcn, change primitives |
| Icons and fonts | Hugeicons; Fraunces and Figtree from Fontsource | Same | Keep |
| Forms | A small `useForm` of our own | **react-hook-form** + Zod, with shadcn's Field components | Change |
| Translations | None (English in the code) | **i18next** + `react-i18next`, ICU messages, Weblate | New |
| Dates and time zones | Hand-rolled helpers | `date-fns` 4 + `@date-fns/tz` | Change |
| Home-screen app | A hand-written service worker | **`vite-plugin-pwa`** (Workbox, `injectManifest`) | Change |
| Working offline | None | TanStack Query's persister (IndexedDB) and a queue of changes made offline | New |
| Notifications | None | `web-push`, with Merran's own VAPID keys | New |
| Webhooks | None | Signed in the Standard Webhooks format, delivered by pg-boss | New |
| MCP server | None | The official MCP TypeScript SDK (`@modelcontextprotocol/sdk`), Streamable HTTP | New |
| Logs | `console` | **pino** | New |
| Error tracking | None | **Sentry SDK**, off unless a DSN is set | New |
| Metrics | None | `prom-client`, off by default | New |
| Email | None | **nodemailer** (SMTP), optional | New |
| Files | A folder under `/data` | A storage interface: a folder (default) or S3-compatible | Change |
| HTML and feeds | cheerio | cheerio | Keep |
| Images | sharp | sharp | Keep |
| PDFs | unpdf | unpdf | Keep |
| Video | yt-dlp + ffmpeg in the image | Same, as an optional module | Keep |
| Browser extension | Vite, by hand, Chrome only | **WXT** (Chrome, Edge and Firefox) | Change |
| Tests | Vitest on PGlite | Vitest on PGlite, plus real Postgres in CI, MSW, and Playwright | Keep, add more |
| Lint and format | ESLint + Prettier | ESLint + Prettier, plus knip | Keep |
| Docs site | None | **Starlight** (Astro) | New |
| CI and releases | GitHub Actions; compose builds from the repo | GitHub Actions, release-please, images on GHCR | Change |

## What changes, and why

### pnpm instead of npm workspaces

- Faster installs, and strict: a package can only import what it lists, so a missing dependency fails on a contributor's machine instead of in someone's deploy.
- Catalogs keep one version of React, Zod and the rest across every package.
- It's what most open-source TypeScript monorepos use, so contributors will know it.
- No Turborepo to start. With four or five packages, pnpm's own `--filter` and `-r` are enough. Add it if CI gets slow.

### Better Auth instead of our own sign-in

Sign-in is the code most likely to hurt people if we get it wrong, and the code most worth sharing with a bigger project. Better Auth gives us, as plugins over our own Postgres through its Drizzle adapter:

- email or username with a password, sessions, and rate limits
- **organizations**, which become households: members, roles and invitations
- **API keys** with permissions, expiry and rate limits, owned by a person or a household
- passkeys and two-step sign-in (TOTP), off until someone turns them on
- single sign-on with OIDC (Authentik, Authelia, Keycloak, Pocket ID, Google and the like) through `@better-auth/sso`
- an admin plugin for the server admin

What we keep for ourselves: **what each role may do.** Better Auth says who someone is and which household they're in; Merran's own service layer decides what they can touch, and every query is scoped to the household (see [platform.md](platform.md#keeping-households-apart)).

**Watch out for:** Better Auth moves quickly and had real security fixes in mid-2026 (SSO and invitation issues fixed in 1.6.11). Use 1.6.14 or later, update every `@better-auth/*` package together, and let Renovate flag security releases straight away.

### pg-boss instead of hand-rolled schedules

The REFERENCE app runs a dozen `setInterval` checks (autoplan every 5 minutes, prices every 15, feeds every 30, purges every 6 hours) plus its own tables for bulk imports and library runs. pg-boss keeps jobs in Postgres, so there's still nothing extra to run:

- cron schedules, retries with backoff, singleton jobs ("one nutrition run per recipe"), throttling and dead letters
- jobs added in the same transaction as the change that needs them, through its Drizzle adapter
- work survives restarts without each feature writing its own "carry on at startup" code

Merran still keeps a small `job_runs` table of its own for what people see: "Importing 6 of 10", a library run's progress, Stop and Try again.

### AI SDK instead of our own provider layer

Households bringing their own keys means far more providers than Claude and OpenAI: Ollama and LM Studio at home, OpenRouter, Mistral, Gemini, anything with an OpenAI-style API. Writing and testing each by hand doesn't scale.

AI SDK 6 gives one way to do structured output from a Zod schema, tools, streaming, vision, image generation, transcription and speech across `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and the rest. Provider-specific features the REFERENCE app relies on are still reachable through provider options and provider tools: Claude's and OpenAI's web search, prompt caching, thinking and effort.

Merran keeps a thin layer on top (`server/src/ai/`) that features call: `extractRecipe()`, `runChat()` and so on. It picks whose key pays, which model runs the task, checks the model can do the job, enforces spending limits and records usage. Features never import the SDK, which also contains the SDK's yearly major-version churn to one folder.

### A model catalog instead of a price table

Each model's price per token, context size, and whether it takes images, tools or structured output, from a catalog generated at release time from a public dataset (such as models.dev), shipped inside the image so nothing is fetched at runtime. The server admin can correct a price. A model the catalog doesn't know (a local Ollama model, say) records its tokens with the cost left blank, and its abilities are found out by a quick test when it's added.

### TanStack Router instead of React Router

Merran keeps a lot in the address: recipe filters, Settings tabs, the week being viewed, `?entry=` in the cook view. TanStack Router validates search parameters with Zod and types every link, so a renamed route or parameter is a type error instead of a dead link. It's built for single-page apps like this one and works hand in hand with TanStack Query.

### A generated API client

The web app and the extension call the API through a client generated from the OpenAPI spec. That keeps us honest: the app uses the same public API anyone else would (see [platform.md](platform.md#the-public-api)), and a change that breaks the spec breaks the build.

### Base UI under shadcn/ui

shadcn/ui stays: we own the components and the Maia look. Since July 2026 shadcn starts new projects on Base UI (from the team behind Radix, Material UI and Floating UI) rather than Radix. Radix isn't going away, but a fresh codebase might as well start on the default the shadcn ecosystem is moving to (decided October 15, 2026). The look carries over; only the primitives underneath change.

### react-hook-form

The REFERENCE app's own `useForm` was small and fine, but contributors already know react-hook-form, and shadcn's form components are documented with it. Validation uses the same Zod schemas as the server.

### Translations from the start

Retrofitting translations means touching every string in the app. Starting with i18next costs very little: every user-facing string goes through `t()`, messages use ICU format (plurals, "1 recipe" and "3 recipes"), and a CI check fails on a string that isn't in the English file. English is the only language at launch; Weblate (free for open-source projects) opens it to translators once the wording settles. See [platform.md](platform.md#languages-units-and-regions).

### WXT for the extension

WXT builds one extension for Chrome, Edge and Firefox from the same code, handles the manifest per browser, reloads while developing, and zips builds for the stores. The REFERENCE extension's hand-made Vite setup was Chrome only.

### Images on GHCR instead of building from GitHub

The REFERENCE compose file built the app from the repo on every start. For everyone else, prebuilt images are faster, smaller to download, can be pinned to a version and verified. See [operations.md](operations.md#getting-merran).

## Considered and not chosen

| Option | Why not |
|---|---|
| Next.js, TanStack Start or React Router's framework mode | Server rendering doesn't help an app that's behind a sign-in and installed to the home screen. One Node process serving the built app and the API is the simplest thing to self-host. |
| tRPC or oRPC | We want a public REST API with an OpenAPI spec for anyone to use. Hono with Zod OpenAPI gives typed routes and the spec in one go. |
| SQLite as well as Postgres | Two databases double the testing, and we lean on Postgres: `pg_trgm`, full-text search, `jsonb`, pg-boss and, later, `pgvector`. The compose file ships Postgres, so there's nothing extra to set up. |
| Bun or Deno | Node 24 runs our TypeScript directly now, and it's what every library we use is tested on. |
| Prisma or Kysely | Drizzle worked well in the REFERENCE app, stays close to SQL, and can describe row-level security policies if we want them later. |
| Auth.js, Lucia, or keeping our own | Lucia is retired, and Auth.js is weaker on passwords, organizations and API keys. Our own worked but would need passkeys, two-step sign-in, SSO and scoped API keys written and reviewed from scratch. |
| BullMQ | Needs Redis, another container for every self-hoster. |
| LangChain or Mastra | Far more than we need. Our assistant is one agent loop over our own tools. |
| Biome | Fast and tidy, but Prettier's Tailwind class sorting and ESLint's React rules are what shadcn projects rely on. Worth another look later. |
