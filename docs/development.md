# Development

What exists so far:
- **`packages/shared`:** request schemas and types used by both sides.
- **`apps/server`:** a Hono server with Postgres and Drizzle, accounts and sessions. It also serves the built web app.
- **`apps/web`:** the app shell, theme, sign-in and setup screens, and Settings for your account and the household.

## Prerequisites

- Node 24 and npm
- Docker, for the local Postgres and to test the production image
- Optional: an Anthropic and/or OpenAI API key in `.env`, to work on AI features (milestone 1). Keys can also be added in the app under Settings → AI.

## Getting started

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run db:up
```

```bash
npm run dev
```

On the first run, the API prints a setup code in the terminal. Open http://localhost:5173 and use it to create your account.

To start over with an empty database, run `docker compose -f compose.dev.yaml down -v`, then `npm run db:up` again.

## Commands

Run these from the repo root.

| Command | What it does |
|---|---|
| `npm install` | Installs all workspaces |
| `npm run db:up` / `db:down` | Starts or stops a local Postgres 18 in Docker (`compose.dev.yaml`). It matches `DATABASE_URL` in `.env.example`. |
| `npm run dev` | Starts Vite on :5173 and the API on :3000 (restarting it on changes). Vite forwards `/api` to the API. |
| `npm test` | Runs the server tests (Vitest) against PGlite, an in-memory Postgres, so Docker isn't needed |
| `npm run build` | Typechecks and builds every workspace |
| `npm start` | Runs the server on its own. It serves `apps/web/dist`, so run `build` first. |
| `npm run typecheck` | Runs `tsc` across workspaces |
| `npm run lint` | Runs ESLint on the web app |
| `npm run format` / `format:check` | Runs Prettier (with Tailwind class sorting) over `apps/` and `packages/` |
| `npm run check:contrast -w @mise/web` | Checks every palette in `index.css` against WCAG contrast. Run it after changing colors. |
| `npm run db:generate -w @mise/server` | Writes a new migration after you change `apps/server/src/db/schema.ts` |
| `MISE_BUILD_CONTEXT=. docker compose up --build` | Runs the production stack from your local checkout. It needs a `.env` with `POSTGRES_PASSWORD`. |

## Shared package

`packages/shared` holds what both sides need to agree on:
- the Zod schemas for request bodies, with their user-facing error messages
- the `User` and appearance types
- `fieldErrors()`, which turns a Zod error into per-field messages

The server validates every request with these schemas, and the web forms validate with the same ones before sending.

It's consumed as TypeScript source, with no build step. Vite compiles it for the web, and Node strips its types on the server.

## Server

```
apps/server/
├── drizzle/              committed SQL migrations
├── drizzle.config.ts
└── src/
    ├── index.ts          startup: connect, migrate, seed, print the setup code, listen
    ├── app.ts            routes, middleware, static files, error handling
    ├── config.ts         settings from the environment
    ├── context.ts        what the app needs (db, setup code) and request variables
    ├── http.ts           HttpError, readBody (validation), clientIp
    ├── auth/             passwords, sessions, rate limiting, setup code, middleware
    ├── db/               schema, client, migrations, seed and reference data
    ├── routes/           setup, auth, me, users (+ tests)
    ├── services/         business logic, shared by routes and (later) AI tools
    └── test/helpers.ts   an app on PGlite, and an API client that keeps cookies
```

- **No build step.** Node 24 runs the `.ts` files directly by stripping the types. That puts some limits on the TypeScript we write:
  - Relative imports include the `.ts` extension (`./config.ts`).
  - Type-only imports use `import type`.
  - Syntax that needs compiling is off (`erasableSyntaxOnly`): no `enum`, no `namespace`, no constructor parameter properties.
- **Settings are read from the environment in `config.ts`.** `DATABASE_URL` is required. In development, `npm run dev` loads the repo-root `.env`. The full settings table is in the [README](../README.md#settings).
- **Errors:** throw `HttpError(status, message, { fields })`, with a message that's safe to show the user. `readBody(c, schema)` does that for invalid input. Anything else becomes a generic 500 and is logged.
- **The web app is served from `apps/web/dist`:**
  - Hashed `/assets/*` files are cached for a year.
  - HTML and the manifest are never cached.
  - Any other path gets `index.html`, so React Router can handle it.

### Database

- **Schema:** `src/db/schema.ts`, with Drizzle. Columns are written in camelCase and stored in snake_case (`casing: "snake_case"`).
- **Changing it:** edit the schema, run `npm run db:generate -w @mise/server`, check the generated SQL in `drizzle/`, and commit it.
  - Migrations run automatically at startup.
  - Never edit a migration that has already shipped; add a new one.
  - For SQL that Drizzle can't express (like `CREATE EXTENSION`), use `npx drizzle-kit generate --custom --name=<name>` and write the SQL yourself.
- **Reference data:** units and store sections live in `src/db/reference-data.ts`. They're inserted at startup if missing, and existing rows are never overwritten.
- **Tests:** they use PGlite with the same migrations and the `pg_trgm` extension. `createTestApp()` gives each test a fresh database.

### Accounts

- **First account:** the first one is created with the setup code from the log (`/api/setup`) and is the admin.
- **The rest of the household:** an admin adds them (`/api/users`).
- **Passwords:** hashed with scrypt.
- **Sessions:**
  - The cookie holds a random token, and the database keeps only its SHA-256.
  - A session lasts 90 days from its last use and is extended at most once a day.
  - Changing or resetting a password signs out that person's other sessions.
- **Rate limits** live in memory: 5 failed sign-ins per username and 20 per IP, per 15 minutes. The setup code allows 10 tries per IP.
- **Middleware:** `loadSession` reads the cookie on every `/api` request. `requireUser` and `requireAdmin` guard routes.
- **Appearance** (mode and palette) is saved on the user.

## Web app layout

```
apps/web/src/
├── app/              router, providers, app-level pages (not found, route error)
├── components/
│   ├── ui/           shadcn/ui components, generated by the CLI
│   ├── layout/       app shell, sidebar, phone tab bar, top bar, account menu, page header
│   ├── form/         TextField (label + input + hint or error)
│   ├── theme/        theme provider, light/dark toggle, palette picker
│   └── brand/        logo
├── features/         one folder per area: auth, recipes, plan, list, pantry, chat, settings, styleguide
├── hooks/            hooks shared across features (use-mobile)
├── lib/              api client, useForm, query client, cn(), small helpers
├── index.css         Tailwind setup, fonts, theme tokens for every palette
└── main.tsx
```

- **A feature folder owns everything for its area:** pages (`*-page.tsx`), components, hooks and API calls. Something moves up to `components/` only when a second feature needs it.
- **Talking to the API:**
  - `api()` in `lib/api.ts` sends and receives JSON and throws `ApiError`, which carries the message and per-field errors.
  - Wrap calls in TanStack Query hooks inside the feature (for example `features/auth/use-session.ts`).
  - A 401 from any query marks the user signed out.
- **Forms:** `useForm(schema, initialValues)` from `lib/form.ts` validates with the shared schema and shows server errors under the right field. Use it with `TextField`.
- **Auth:**
  - `RequireAuth` wraps the app shell and sends signed-out people to `/login`, or to `/setup` on a fresh install.
  - Inside it, `useCurrentUser()` returns the signed-in user. It reads from context, not the session query, so nothing renders mid-sign-out.
  - `AppearanceSync` applies the account's mode and palette on sign-in and saves changes back.
- **`components/ui/` is shadcn's code.** Add or update components with the CLI. Small local fixes are fine, but list them here so a CLI update doesn't silently undo them. Current fixes:
  - `spinner.tsx`: the `strokeWidth` prop type
  - `sonner.tsx`: uses our theme context instead of `next-themes`
  - `hooks/use-mobile.ts`: rewritten with `useSyncExternalStore`
- **Navigation:** the sidebar (iPad and desktop) and the bottom tabs (phone) both read `components/layout/nav-items.ts`.
- **Icons:** Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`), at stroke width 2.
- **Unfinished buttons** call `comingSoon(feature, milestone)` from `lib/coming-soon.ts`, which shows a toast. That way the layout is real before the feature is.
- **`/styleguide`** shows every building block in the current theme. Use it to check color and component changes.
- **Home screen:**
  - `public/manifest.webmanifest` and the icons in `public/icons/` make Mise installable.
  - The icons were rendered from the favicon artwork. If the logo changes, re-render them at 192, 512 (plus a full-bleed maskable 512) and 180 for Apple.

## Theme

- **The look:** shadcn/ui's **Radix** components in the **Maia** style (soft, rounded, roomy). Headings use **Fraunces** and body text uses **Figtree**. Both fonts are self-hosted through Fontsource, so nothing loads from Google.
- **Color comes only from tokens.** Use classes like `bg-primary`, `text-muted-foreground` and `bg-highlight`, never raw colors in components. The palette picker's preview swatches are the one exception.
  - `highlight` is our own token, added to shadcn's set. It's for timers, ratings and the current cook step.
- **Palettes:** `index.css` defines each one as a light block and a `.dark` block. Sage is the default. The others apply when `<html data-palette="paprika">` (or `castiron`) is set.
  - The palette names come from `@mise/shared`, because accounts save them.
  - `ThemeProvider` caches the mode and palette in `localStorage`.
  - An inline script in `index.html` applies them before first paint, so the page never flashes the wrong theme.
- **Changing a palette:**
  1. Edit its token blocks in `index.css`.
  2. Update its preview swatches in `components/theme/palettes.ts`.
  3. Run `npm run check:contrast -w @mise/web`. Body text must reach 7:1 contrast, other text 4.5:1, and focus rings 3:1.

## Adding shadcn/ui components

Run the shadcn CLI from `apps/web`. Components land in `apps/web/src/components/ui/` and are ours to edit.

```bash
npx shadcn@latest add button card drawer sheet
```

The app was created with `npx shadcn@latest init -t vite -n web -b radix -p maia`. That sets up Tailwind v4, the `@/` path alias and `components.json`. To try a different shadcn style later, see `npx shadcn@latest apply --help`.

## Conventions

- **Business logic lives in `apps/server/src/services/`.** Routes and AI tools stay thin and call services, so behavior never drifts between them.
- **Zod at every boundary.** Request bodies, AI outputs, imported data and anything else that comes from outside goes through a schema from `packages/shared`.
- **Keep the raw ingredient text.** Parsed fields are helpers, and the text the user or site wrote is the source of truth for display.
- **AI calls only go through the provider interface in `apps/server/src/ai/`.** Features call functions like `extractRecipe()`, `cleanupRecipe()` or `runChat()`, never an SDK directly. Provider-specific code stays in `ai/providers/anthropic.ts` and `ai/providers/openai.ts`.
- **The AI proposes and the user applies.** AI features create proposals and never write to recipes, the plan, the list or the pantry directly.
- **Tests:**
  - Server routes are tested through HTTP with `apiClient` on a PGlite database.
  - The ingredient parser, quantity math, JSON-LD extraction and list combining get unit tests with real-world fixtures.
  - AI features are tested with recorded provider responses, so tests don't spend money.
  - A few Playwright flows will cover import → cook view and plan → list.
- **Migrations are committed** and run at startup. Never edit one that has already shipped.
