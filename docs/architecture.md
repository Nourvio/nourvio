# Architecture

## Overview

```
  Phone / iPad / desktop        walmart.com +
  browser (home-screen app)     Mise extension
             │                         │
             └────────────┬────────────┘
                          ▼
        Cloudflare Tunnel (public HTTPS URL)
                          ▼
  ┌─ mise container ──────────────────────────────┐
  │  Web app (static) Hono API                    │
  │                       │                       │
  │             service layer ─► AI providers ────┼──► Claude API
  │                       │           └───────────┼──► OpenAI API
  │  photos: /data/images │                       │
  └───────────────────────┼───────────────────────┘
                          ▼
  ┌─ db container ────────────────────────────────┐
  │  Postgres 18, database "mise"                 │
  └───────────────────────────────────────────────┘
```

There are two containers:
- **mise** serves the built React app and the API, and stores recipe photos under `/data/images`.
- **db** runs Postgres.

All AI calls go from the server straight to Claude or OpenAI, using API keys you add in Settings or as environment variables. The chat lives inside the app.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | Used everywhere: web, server, shared code and the extension |
| Web framework | React 19 + Vite | A single-page app, installable to the home screen |
| Components | [shadcn/ui](https://ui.shadcn.com) (Radix, Maia style) on Tailwind CSS v4 | Components are copied into the repo, so we own and restyle them. Icons are Hugeicons. Fonts are Fraunces for headings and Figtree for body text. See [development.md](development.md#theme). |
| Routing / data | React Router 8, TanStack Query | Query handles caching, refetching and optimistic updates |
| Forms | react-hook-form + Zod | shadcn's Form component is built on these |
| Server | [Hono](https://hono.dev) on Node 24 | Uses web-standard Request/Response, which makes streaming chat simple |
| Database | PostgreSQL 18, Drizzle ORM, node-postgres (`pg`) | Migrations come from drizzle-kit and run automatically at startup. Tests run against PGlite (Postgres compiled to WebAssembly), so they don't need Docker. |
| Validation | Zod | The same schemas run on client and server |
| AI | `@anthropic-ai/sdk` and `openai`, each provider's official SDK | Behind one small provider interface. See [AI](#ai). |
| HTML parsing | cheerio | For recipe import |
| Video | yt-dlp and ffmpeg, in the Docker image | For recipes from TikTok, YouTube and Instagram. See [integrations.md](integrations.md#video-links-tiktok-youtube-instagram). |
| Tests | Vitest; Playwright for a few end-to-end flows | |
| Extension | Chrome/Edge Manifest V3, built with Vite | Milestone 6 |
| Package manager | npm workspaces | |

## Project layout

```
mise/
├── apps/
│   ├── web/                 React + Vite + shadcn/ui (layout: development.md)
│   │   ├── src/components/      ui/ (shadcn), layout/, theme/, brand/
│   │   ├── src/features/        recipes, plan, list, pantry, chat, cook, settings
│   │   └── src/lib/             api client, query client, utils
│   ├── server/              Hono app
│   │   ├── src/routes/          thin HTTP handlers
│   │   ├── src/services/        all business logic (used by routes and AI tools)
│   │   ├── src/ai/              provider interface, Claude + OpenAI providers, prompts, tools, jobs
│   │   ├── src/import/          link / video / text / photo / Mealie importers
│   │   └── src/db/              Drizzle schema, migrations, seed (units, sections)
│   └── extension/           Mise browser extension: page import, list side panel, Walmart cart (milestone 6)
├── packages/
│   └── shared/              Zod schemas, types, ingredient parser, quantity math
├── docs/
├── docker/                  container entrypoint
├── Dockerfile
├── compose.yaml             production stack (builds from GitHub)
└── compose.dev.yaml         local Postgres for development
```

**One service layer.** The REST routes and the AI tools call the same service functions, so "add to plan" behaves the same whether you tap a button or ask the assistant.

## Data model

**Foods are matched by name, not by a table.** The shared package normalizes a food name (`foodKey`: lowercase, sizes and "fresh" dropped, singular), so "2 Large Onions" and "1 onion" are both "onion". The pantry goes a step further (`pantryKey`: prep and quality words like "boneless", "unsalted" and "diced" dropped too). That's what lets the same onion add up across recipes, get subtracted by the pantry, find its USDA nutrition (`food_matches`), and (later) map to a Walmart product, with nothing for anyone to set up.

Everything a household owns carries its `household_id`, and every query is scoped by the signed-in person's household. Another household's recipe, photo, suggestion or member is a 404.

| Table | Key columns | Purpose |
|---|---|---|
| `households` | name, settings (jsonb: auto-tidy, meals planned, first day of the week, always-on-hand items, tastes and rules, the weekly autoplan with its time zone and last run) | A household shares a library, plan, list and pantry. Deleting one removes everything in it. |
| `invites` | household_id, token_hash, role, expires_at, used_at, used_by | Single-use invite links, good for a week. Only a hash of the token is stored, so the link can only be shown when it's made. |
| `recipes` | id, household_id, slug (unique per household), name, description, image, image_ai (made by AI), source_url, servings, yield_text, prep/cook/total_minutes, notes, rating, nutrition (jsonb, per serving + source), diet_overrides (jsonb), origin, last_made_at, search (tsvector) | `origin` is one of url, text, photo, manual, chat, mealie |
| `recipe_ingredients` | recipe_id, position, section, raw_text, quantity, quantity_max, unit_id, food, note | `raw_text` is always kept and shown as written. The parsed fields drive scaling, lists and nutrition. |
| `recipe_steps` | recipe_id, position, section, text | |
| `discoveries` | household_id, user_id, theme, status (searching, done, failed), error, recipes (jsonb: link, name, site, time, photo, why) | Find recipes → Discover with AI. The latest twelve per household are kept |
| `followed_sites` | household_id, name, site_url, feed_url, items (jsonb: the newest posts, each a recipe, not one, or not opened yet), skipped (jsonb: posts that weren't recipes), checked_at, error | Find recipes → Sites. One row per site per household |
| `cook_notes` | household_id, recipe_id, user_id, rating, note, created_at | "How did it go?" after cooking. A note can become a `recipe_edit` proposal (with the note in `payload.fromNote`), shown on the recipe page like a tidy-up |
| `recipe_versions` | recipe_id, snapshot (jsonb), source, created_by, created_at | Every saved change makes a snapshot, so the original import can always be restored. `source` is one of import, manual, ai_cleanup, chat. |
| `tags`, `recipe_tags` | household_id, name (unique per household, ignoring case) | |
| `recipe_pairings` | household_id, recipe_id, paired_recipe_id or tag | What a recipe goes with: one recipe, or every recipe with a tag (matched ignoring case, so new ones join) |
| `fdc_foods` | fdc_id, description, data_type, nutrients (jsonb, per 100 g), portions (jsonb: label, amount, grams) | USDA foods we've used, cached for good. Shared by every household; it's public data. |
| `food_matches` | food (the `pantryKey`: prep words dropped, so "chopped onion" is "onion"), fdc_id (null when nothing fit), grams (jsonb: what one of a unit weighs, by unit id or "each") | Which USDA food a name means, picked once (by the AI when there is one) and reused by every recipe and household |
| `units` | name, abbreviation, aliases, kind (volume/weight/count), to_base | `to_base` converts to ml or g for safe unit conversion. Seeded at startup. |
| `meal_plan_entries` | household_id, date, meal, position, recipe_id (null for a note), with_recipe_id (what it's made with), note, servings (null for the recipe's own), status, listed_at, pantry_used (jsonb) | `status` is planned, cooked or skipped. `listed_at` is set once its ingredients are on the list. `pantry_used` holds the pantry rows as they were before cooking it, to put back. |
| `shopping_items` | household_id, key, name, quantity, unit_id, amount_text, section_id, checked, checked_at, source, recipes (jsonb), entries (jsonb) | One list per household. `key` merges the same food across recipes. `source` is plan, manual or weekly. `entries` are the planned meals it's for. |
| `weekly_items` | household_id, name, amount, section_id | Every-week items, added with each week's plan |
| `food_sections` | household_id, food, section_id | Remembers where the household moved a food, for next time |
| `plan_rules` | name, days, meal, tag filters, no_repeat_days, prefer_rating | *Later.* Saved rules for suggestions. |
| `pantry_items` | household_id, key, name, quantity, unit_id, amount_text, section_id, use_by, entries (jsonb) | `key` is the pantry match key. `entries` are the planned meals it was bought for. |
| `store_products` | household_id, shop, food, product (jsonb: store id, UPC, name, size, photo, price, sale price, aisle, stock, link), chosen | The product a household buys for a food (the food part of a list item's key) at each store. `chosen` is false while it's only Mise's suggestion |
| `shop_connections` | household_id, shop, store (jsonb), modality (pickup or delivery), account (jsonb: Kroger tokens, encrypted; who linked it), last_sent (jsonb: list item → packages) | A household's store and linked account |
| `proposals` | household_id, kind (cleanup, recipe_edit, new_recipe, plan_meals, list_items), recipe_id (null when there isn't one), payload (jsonb: summary, before/after sections, draft, variant name, meals, items), status, job_id, conversation_id, result_recipe_id | A pending change from the AI, waiting for you to apply or dismiss it (see [AI](#ai)) |
| `chat_conversations` | household_id, user_id, title, provider, model | Private to the person who started it. Stays on the provider and model it started with, so it can resume exactly. |
| `chat_messages` | conversation_id, position, role, parts (jsonb: text, tool activity and proposal ids, for display), native (jsonb: the provider's own messages), context_label | One user message, or one whole assistant reply (which can span several model calls and tool uses) |
| `ai_usage` | household_id, user_id, provider, model, task, input/output tokens, cost, created_at | Spend tracking per household, on the server's keys |
| `ai_jobs` | household_id, kind, status, total, done, skipped, failed | Long-running work: tidying a household's library, or the Mealie import. A run cut short by a restart is marked "interrupted". |
| `settings` | key, value (jsonb) | Server-wide: AI keys (encrypted) and models, and whether sign-up is open |
| `users` | username (unique on the server), household_id, role (admin or member, in the household), is_server_admin | |
| `sessions`, `api_tokens` | | Login, and the extension's token |

### Postgres features we use

- **`jsonb`** for nutrition, chat messages, version snapshots and proposal payloads.
- **`pg_trgm`** makes recipe search tolerant of typos.
- **Full-text search** (`tsvector`) across recipe names, ingredients, tags and steps.
- **Later:** `pgvector` for meaning-based search ("something cozy with chicken"). That needs the `pgvector/pgvector:pg18` image instead of `postgres:18`, with no other changes.

### How the pantry follows the plan

1. Adding the plan to the list records, on each item, which planned meals it's for (`shopping_items.entries`). Food already in the pantry and not set aside for another upcoming meal is subtracted first.
2. **Put away** moves checked items into the pantry with those meals (`pantry_items.entries`) and a guessed use-by date for fresh food.
3. Marking a meal **cooked** subtracts its scaled ingredients from matching pantry rows, the ones bought for it first, and keeps a snapshot in `pantry_used`. Marking it back to planned (or skipped) restores the snapshot.
4. If a meal is **skipped**, or its date passes uncooked, its fresh food shows as a leftover under **Use soon** (worked out when read, so there's nothing to update). Fill the week gives each Use soon item a recipe first, and the assistant sees them in its context.

## API

JSON over REST under `/api`. Chat streams with server-sent events.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; first run `GET /api/setup/status`, `POST /api/setup` |
| Joining | `GET`/`POST /api/join/:token` (invite links), `POST /api/signup` (when open) |
| Household | `GET`/`PATCH /api/household`, `PUT /api/household/tastes` (anyone in the household), `PUT /api/household/autoplan` and `POST /api/household/autoplan/run` (household admins); invites `GET`/`POST /api/household/invites`, `DELETE /api/household/invites/:id`; members `GET`/`POST /api/users`, `PATCH`/`DELETE /api/users/:id` (household admins) |
| Server | `GET`/`PUT /api/server/settings`, `GET /api/server/households`, `DELETE /api/server/households/:id` (server admin) |
| Recipes | `GET/POST /api/recipes` (search with `q`; diet, tag and time filters and sorting happen in the browser), `GET/PUT/DELETE /api/recipes/:id`, `POST /api/recipes/:id/made`, `POST /api/recipes/:id/image`, `POST /api/recipes/:id/nutrition` (work it out now), `PUT /api/recipes/:id/diets` (corrections) |
| Tags | `GET /api/recipes/tags`, `PATCH /api/recipes/tags/:name` (rename, merging into an existing tag), `DELETE /api/recipes/tags/:name` |
| Cooking notes | `GET`/`POST /api/recipes/:id/cook-notes`, `DELETE /api/recipes/:id/cook-notes/:noteId` |
| Swaps | `POST /api/recipes/:id/substitutes` (for one ingredient, knowing the pantry and the household's rules), `POST /api/recipes/:id/swap` (into the recipe for good; returns the version before, to undo) |
| Pairings | `GET /api/recipes/:id/pairings` (the rules, the recipes they add up to, and what it's offered with), `POST /api/recipes/:id/pairings` (recipes or a tag), `DELETE /api/recipes/:id/pairings/:pairingId` |
| Nutrition | `GET`/`POST /api/nutrition/library`, `POST /api/nutrition/library/:id/stop` (household admins); `GET`/`PUT /api/nutrition/settings`, `POST /api/nutrition/settings/test` (server admin, the USDA key) |
| Photos | `POST /api/recipes/:id/photo` (make one with AI), `GET /api/recipes/:id/photo` (whether one is being made); `GET`/`POST /api/photos/library`, `POST /api/photos/library/:id/stop` (household admins) |
| Versions | `GET /api/recipes/:id/versions`, `POST /api/recipes/:id/versions/:versionId/restore` |
| Collections | `GET /api/collections` (the starter collections, with which recipes are in the library), `GET /api/collections/:id/:index/image` (a recipe's photo, through Mise) |
| Sites | `GET /api/sites` (followed sites with their newest recipes), `POST /api/sites` (follow by any page, a feed, or a suggestion), `DELETE /api/sites/:id`, `GET /api/sites/:id/image/:key` (a post's photo, through Mise) |
| Discover | `GET /api/discover` (recent searches), `POST /api/discover` (start one; it carries on in the background, one per household at a time), `GET /api/discover/:id`, `GET /api/discover/:id/:index/image` |
| Import | `POST /api/import/url` (pages and video links), `/text`, `/photo`; Mealie (server admin, into their household): `POST /api/import/mealie/check`, `POST /api/import/mealie`, `GET /api/import/mealie/job` |
| AI cleanup | `POST /api/recipes/:id/cleanup` (returns a proposal, or null when there's nothing to change), `GET /api/recipes/:id/proposal`; library runs at `GET`/`POST /api/ai/cleanup-job` and `POST /api/ai/cleanup-job/:id/cancel` (household admins) |
| Proposals | `GET /api/proposals` (pending), `POST /api/proposals/:id/apply` (chosen sections), `POST /api/proposals/:id/dismiss` |
| Chat | `POST /api/chat` (reply streams as server-sent events: conversation, text, tool, proposal, done, error), `GET /api/chat/conversations`, `GET`/`DELETE /api/chat/conversations/:id` |
| Jobs | `GET /api/jobs/:id` |
| Plan | `GET /api/plan?from=&to=` (up to 62 days), `POST /api/plan/entries`, `POST /api/plan/entries/batch`, `PATCH`/`DELETE /api/plan/entries/:id` (a new `recipeId` swaps the recipe), `POST /api/plan/suggest` (ideas for empty meals, with `exclude`) |
| List | `GET /api/list`, `POST /api/list/items`, `PATCH`/`DELETE /api/list/items/:id`, `POST /api/list/clear-checked`, `POST /api/list/put-away`, `POST /api/list/from-plan`, `PUT /api/list/on-hand`; every-week items `GET`/`POST /api/list/weekly`, `PATCH`/`DELETE /api/list/weekly/:id`, `POST /api/list/weekly/add-to-list` |
| Pantry | `GET`/`POST /api/pantry` (a typed line), `PATCH`/`DELETE /api/pantry/:id`; `POST /api/list/put-away` moves checked list items in |
| AI settings | `GET /api/ai/status` (everyone); `GET`/`PUT /api/ai/settings`, `POST /api/ai/settings/test`, `GET /api/ai/settings/models`, `GET /api/ai/settings/usage` (server admin) |
| Shop | `GET /api/shop` (the household's connections); Kroger: `GET`/`PUT /api/shop/kroger/app` (server admin), `GET /api/shop/kroger/locations?zip=`, `PUT /api/shop/kroger` (store, pickup or delivery; household admins), `POST /api/shop/kroger/link` and `GET /api/shop/kroger/callback` (signing in), `DELETE /api/shop/kroger/link`, `GET /api/shop/kroger/basket`, `GET /api/shop/kroger/search?q=`, `PUT /api/shop/kroger/products/:itemId`, `POST /api/shop/kroger/send`; `GET /api/shop/image?u=` (a store's product photo, through Mise; store image servers only) |
| Images | `GET /api/images/:file` |

## AI

### Providers

- **Two providers, each through its official SDK.** Anthropic uses `@anthropic-ai/sdk`. OpenAI uses `openai`, with its Responses API.
- **A small interface** in `apps/server/src/ai/` hides the differences. Each provider implements:

| Operation | What it does |
|---|---|
| `extract` | Returns structured output from a Zod schema |
| `listModels` | Lists the models available to the key (also how a key is tested) |
| `chat` | *Milestone 2.* Streams a reply, with tools |
| `transcribe` | Speech to text, for videos without captions (OpenAI only) |
| `generateImage` | A picture from a description, for recipe photos (OpenAI only). Photos all use one style prompt (`services/photos.ts`), and new recipes without one get one in the background when the server's setting allows. |

- Features go through `ai/service.ts`, never an SDK directly. It picks the provider and model for the task, makes the call and records usage.
- **Tools are defined once**, as Zod schemas, and converted to each provider's tool format.
- **API keys:**
  - Keys come from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or **Settings → AI**.
  - An environment variable wins and shows in Settings as "Set on the server."
  - Keys saved in Settings are encrypted at rest (AES-256-GCM) with a key derived from `MISE_SECRET`, or from a random `data/app/secret` file if that isn't set. A database dump alone can't reveal them.
  - A key is tested against the provider before it's saved.
  - Keys are never sent back to the browser. Settings shows only the last four characters, with a **Test** button.
  - Only the server admin can change AI settings. Every household uses the same keys, and usage is recorded per household.
- **Models:**
  - Settings has a default model, picked from the providers' live model lists.
  - Each task can override that default. So far: importing, tidying, the assistant (which also plans meals) and nutrition; shopping translation joins later.
  - Nutrition, ingredient swaps and finding recipes are simple work, so unless they have their own pick they use the small model of the default's provider (Claude Haiku 5.5 or GPT-6 Luna).
  - With nothing picked, the defaults are Claude Opus 5.5 (`claude-opus-5-5`) and GPT-6 Sol (`gpt-6-sol`).
  - A pick whose provider has lost its key is skipped, so removing a key never breaks import.
- **Claude specifics:**
  - Structured outputs through `messages.parse` with `zodOutputFormat`.
  - Effort set per task (`low` for extraction and cleanup, `medium` for chat and planning).
  - The system prompt and tools are cached between turns.
  - Not used: the beta server-side refusal fallback. It only matters when a model declines, which reading recipes doesn't trigger.
- **OpenAI specifics:**
  - Structured outputs through `responses.parse` with `zodTextFormat`, from the same Zod schema. Reasoning effort is `low` for extraction.
  - OpenAI applies prompt caching automatically.
- **Spend:** every call records tokens and estimated cost in `ai_usage`. The cost is worked out from a price table in the shared package when the call is made, so later price changes don't rewrite history. Settings shows totals by month and model.
- **Without any key,** AI features are hidden and the rest of the app works.

### Proposals: how the AI changes things

The AI never writes directly to recipes, the plan, the list or the pantry.

1. A chat tool or a cleanup run creates a **proposal**: a pending change stored in `proposals`.
2. The UI shows it as a preview. That's either the new recipe, or a before/after view of each changed section.
3. You apply it (all of it or chosen sections) or dismiss it.
4. Applying goes through the service layer and records a `recipe_versions` snapshot, so any change can be undone.

### Chat assistant

- **An agent loop on the server** (`apps/server/src/chat/`): each provider's adapter streams one model call and returns any tool calls; the loop runs the tools, feeds the results back, and repeats (up to 8 rounds). Everything streams to the browser as server-sent events, including a tool's activity line as soon as the model starts writing its input.
- **Native histories:** each conversation keeps the provider's own messages (Claude's thinking blocks and tool calls, OpenAI's encrypted reasoning items), so it continues exactly. A conversation never switches provider.
- **Claude:** adaptive thinking (not shown, but passed back between turns), medium effort, and the conversation prefix cached with `cache_control`. **OpenAI:** stateless Responses API (`store: false`) with encrypted reasoning passed back.
- **Context goes with each message:** the recipe on screen and the scale it's shown at, or the week of the plan being viewed with what's planned and what in the pantry needs using soon, prepended in a `<context>` block. The person can drop it with one tap.
- **Read tools:** `search_recipes`, `get_recipe`, `list_tags`, `get_recipe_pairings`, `get_meal_plan`, `get_shopping_list`, `get_pantry`.
- **Web search** is the provider's own tool, run on their side (Claude's `web_search_20250305`, up to 5 searches a reply; OpenAI's `web_search`). Each search shows as an activity line ("Searched the web for …") and costs about a cent on top of tokens, recorded with the reply's usage. Claude can pause a long search turn; the loop sends it back to carry on. OpenAI's search items aren't sent back (nothing is stored there to look them up).
- **Proposal tools** (each makes a card with buttons, nothing is saved until tapped):
  - `propose_new_recipe`: a recipe from the conversation
  - `propose_recipe_edit`: substitutions, scaling, notes; with a `variantName`, it can be saved as a new recipe instead of changing the original
  - `tidy_recipe`: runs the regular tidy-up on a recipe
  - `propose_meals`: recipes (or notes) for days and meals, added to the plan in one tap
  - `propose_list_items`: lines for the shopping list
  - `propose_import_recipe`: a recipe page found on the web, imported with one tap through the regular link importer (checked to open first, and skipped if the link is already in the library)
  - `propose_tastes`: something for the household to remember (a food someone avoids or is allergic to, a diet, the weeknight time limit, a note), offered when it comes up in passing
  - *Later:* `propose_pantry_update`
- **Tastes and rules** go in the system prompt, and search results and recipes say when one "doesn't suit the household" (`tasteWarnings` in `packages/shared/src/tastes.ts`), so the assistant follows them and treats allergies as strict.
- **Failures:** a tool error goes back to the model as a result so it can recover. If the provider fails, nothing is saved and the message goes back in the box to resend. Stopping a reply keeps what had arrived.
- Conversations are saved per person, listed newest first, and can be picked up again or deleted. Usage is recorded under the "chat" task.

### Recipe cleanup

Imported recipes are often messy: odd formatting, run-on steps, "Enjoy!", no tags. Cleanup asks the AI to tidy a recipe and returns a proposal you review.

| Option | What it does |
|---|---|
| Ingredients | Consistent quantities and units, combined lines split ("salt and pepper"), prep notes moved after a comma |
| Steps | Reworded to be short and clear, long steps split, filler and ads removed, nothing about the method changed |
| Tags | Suggested from our existing tags first (to avoid near-duplicates like "weeknight" and "weeknights"), new tags only when nothing fits |
| Description | A one- or two-sentence summary, if missing |
| Missing details | Servings and times filled in when they can be worked out. Values already set are never changed. |

**When it runs:**
- **On demand:** a **Tidy up** button on any recipe, with checkboxes for the options above. You can also ask in chat.
- **After import:** a setting to run it automatically. The proposal is waiting when the import finishes.
- **In bulk:** over every recipe that hasn't been tidied yet, for example right after the Mealie import. A background job, two recipes at a time, with progress in `ai_jobs`; it stops after three failures in a row (a bad key, no credit). The results arrive in the Review queue. *Later:* the providers' batch APIs, which cost half as much and usually finish well within a day.

**How suggestions are kept honest:**
- Only real changes become a proposal. An empty list from the model never wipes a section, and "nothing to change" is recorded too, so a library run skips that recipe next time.
- Each section is applied or skipped on its own.
- A section that's been edited since the suggestion was made is refused, not overwritten, and the message names it.
- A new tidy-up replaces any earlier pending suggestions for the same recipe.

The original is always kept. Every applied cleanup adds a version, and the first imported version can be restored.

### Other AI jobs

- **Structured extraction (import):** turns a web page without recipe data, pasted text, or photos into a recipe draft. The draft's ingredient lines and steps go through the same parser as everything else.
- **Week suggestions:** today, Fill the week is rules only (no AI, though it does use up the pantry's Use soon items first), and the assistant can plan meals in chat. *Later:* the rules pick candidates and the AI ranks them, weighing preferences too.
- **Store products** (`services/shop.ts`, `shop/kroger.ts`): the review ("basket") takes each unchecked list item, refreshes the remembered products' prices from Kroger (50 per call), and searches Kroger for items without one (four at a time). The small model (task `shopping`) picks from each item's results in one call; without AI it's the first in stock. Packages come from `packagesFor` (`packages/shared/src/shopping.ts`): the list amount as a count, grams (`gramsFor`, with USDA portions) and millilitres, against the package size read from Kroger's `size` ("1 gal", "3 lb bag", "6 ct / 12 fl oz"), with 10% leeway. Cans, jars and packages count one for one. Sending adds the ticked lines to the cart by UPC (25 per call), marks those products chosen, and remembers what was sent.
- **Kroger sign-in:** OAuth authorization code with PKCE; the state lives in memory for 10 minutes and must come back to the same person. Access tokens (30 minutes) are refreshed when needed; if Kroger refuses the refresh token, the account is marked to link again. The redirect address is `PUBLIC_URL` (or the forwarded host) + `/api/shop/kroger/callback`; the dev server's proxy forwards the browser's host so it's right in development too.
- **Finding recipes** (`services/discover.ts`): the small model, with web search, gets the theme and the household's rules and calls `offer_recipes` with 10 to 12 picks. Mise opens each page (four at a time) and keeps those with recipe data, under the link they land on; if fewer than four work, the model hears which failed and offers more once. Up to eight are kept, no more than two from one site unless there aren't enough others. It runs in the background; a search still "searching" after five minutes was cut short and shows as failed.
- **Nutrition** (`services/nutrition.ts`):
  - Each new food is searched in USDA FoodData Central (Foundation and SR Legacy foods), and the AI picks the candidate that's the food as used, or none. The match is cached in `food_matches`.
  - Amounts become grams from the line (weights, "1 (15 oz) can") or the food's USDA portions ("1 medium" = 110 g, "1 cup, chopped" = 160 g). What portions can't cover ("4 chicken thighs") the AI weighs, and that's cached per unit too, so most recipes after the first few need no AI at all.
  - Without AI, a small scoring rule picks matches. Without a USDA key, or when more than a third of the lines can't be counted, the AI estimates the whole recipe instead, labeled as an estimate.
  - It runs in the background after a recipe is saved with new ingredients (one run per recipe at a time). The library run goes two at a time and waits out USDA's hourly limit (1,000 requests) rather than failing.

### Rough cost

API usage is billed per token by each provider, separately from any ChatGPT or Claude subscription. Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens, so an import, a cleanup or a chat message usually costs a few cents. Cleaning up a few hundred recipes through a batch API should cost a few dollars.

## Ingredient parsing

The parser lives in the shared package, so the server and browser use the same code. It splits a line like `1 ½ cups all-purpose flour, sifted` into four parts:

| Part | Value |
|---|---|
| Quantity | 1.5 |
| Unit | cup |
| Food | all-purpose flour |
| Note | sifted |

- It handles fractions, unicode fractions (½), ranges (2–3), and sizes in parentheses (`1 (14.5 oz) can`).
- The original text is always kept. Display shows the line as written, swapping in the scaled quantity when you change servings.
- **Grams:** each ingredient comes with `unitGrams`, what one of its unit weighs, worked out when the recipe is read (`nutrition/weights.ts`) so it always uses the latest matches. The order: the weight the line states ("(200 g)", spread over its amount so it scales), a weight unit, a can's size, a stick of butter, the shared baking table (`weights.ts`, grams per cup for about fifty staples), the matched USDA food's volume portions, then what the AI weighed before. "1 cup plus 2 tbsp" counts both. The same order weighs ingredients for nutrition.
- **Pairings** (`pairings.ts`): a recipe with what it goes with is put together in the browser, not saved. The pairing is scaled to the same servings when both say how many they make (else a batch per batch), its lines and steps come first under its own heading, nutrition per serving is the two added up, and diet labels are the ones both share. The list and pantry use the same scaling for a planned meal's pairing (`services/meal-lines.ts`).
- **Tastes and rules** (`tastes.ts`): foods to avoid are matched as whole words, singular or plural ("mushroom" finds "cremini mushrooms"), except "nuts", "dairy", "gluten", "eggs" and "meat", which use the diet labels' careful check (pesto has nuts). Suggestions leave out recipes with an avoided food or missing a required diet, sauces included, and keep dinners Monday to Thursday within the time limit (a recipe with no time given is allowed).
- **Diet labels** (`diets.ts`) come from the ingredient lines when a recipe is read: each line is checked against groups (meat, fish, dairy, egg, gluten, nuts, honey), after taking out phrases that don't count ("vegetable broth", "corn tortillas", "peanut butter"). A diet is labeled only when no line rules it out. `diet_overrides` holds the household's corrections, which win. Listing the library remembers each recipe's labels in memory until its `updated_at` changes (saving ingredients always updates the recipe), and reads only the columns a card needs, so a big library lists without reading every ingredient line each time.
- **Hands-free cooking** uses the browser's Web Speech API: speech recognition for commands (parsed by `parseCookCommand` in `packages/shared/src/cook-voice.ts`, whole phrases only) and speech synthesis to read steps, amounts and confirmations, with units spoken in full. Listening pauses while speaking and restarts when the browser stops it; a timer covers browsers that never report speech finishing.
- **Weekly autoplan** (`services/autoplan.ts`): the server checks every five minutes. For each household with it on, `autoPlanDue` (`packages/shared/src/autoplan.ts`) works out, in the household's time zone, the week the most recent scheduled time is for (the week starting on or after that day); if that week isn't handled and hasn't ended, the week is marked handled and then filled from today on with the same suggestions as Fill the week, and added to the list. Turning it on counts the current week as handled, so it waits for the next scheduled time.
- **Starter collections** (`collections/starter.ts`) are a fixed list in the code, each recipe checked to import when the list was made (sites that block servers, like Serious Eats and Allrecipes, are left out). Importing goes through the normal link import, so a recipe already in the library is matched by its link. Their photos are fetched once through Mise (sending the recipe page as the referer, which some sites need) and kept as small WebP thumbnails under `/data/images/remote`, so browsing doesn't load full-size photos from other sites (`services/remote-images.ts`).
- **Followed sites** (`import/feeds.ts`, `services/sites.ts`): following finds the feed the page links to (not a comments feed), or tries `/feed/` and `/rss.xml`, also when the home page turns Mise away. RSS and Atom are read with cheerio, photos from media tags, an image enclosure or the post's first image. Each new post is opened once, one at a time per site with a 3-second pause (many sites refuse quick repeat visits), and kept only if it has recipe data; the rest are remembered as skipped. A post that won't open leaves the site alone for 30 minutes. Feeds are read again every 6 hours (checked every half hour), keeping up to 24 posts per site, older recipes included.
- **Kitchen timers** live in the browser outside any page (saved in localStorage), so they keep running and ringing anywhere in the app and survive a reload. The cook view also saves where you got to for 12 hours.
- When a food or unit isn't recognized, the line still saves. It just won't combine with other lines on lists or match the pantry.

## Auth

- **Accounts:** each person signs in with a username (unique on the server) and password, hashed with scrypt, and belongs to one household.
- **Sessions:** 90-day session cookies, renewed as they're used, so the kitchen iPad stays signed in. They're `HttpOnly` and `SameSite=Lax`, plus `Secure` over HTTPS. The database stores only a hash of each token.
- **Rate limiting:** 5 failed sign-ins per username and 20 per IP, per 15 minutes.
- **First run:** the first account, with the first household, is created with a one-time setup code printed in the server log. That person is the server admin.
- **Joining:** invite links (192-bit random tokens, stored hashed, single use, 7 days) into a household; or open sign-up, off by default, which creates a new household. Both are rate limited per IP.
- **Roles:**
  - a household admin manages that household's members, invites and settings
  - the server admin manages AI keys and models, sign-up, households and the Mealie import
  - a household always keeps at least one admin
- **Isolation:** every household-owned query filters by the signed-in person's household, photos included (a photo is served only if one of your household's recipes uses it). Tests cover each kind of data.
- **Extension:** uses a personal API token created in Settings.
- **Recipe import safety:** the server refuses to fetch private-network addresses. This stops someone from using the import feature to reach other machines on the home network.

## UI

### Screens

| Screen | Purpose |
|---|---|
| Today | The home page: the next meal today (or a dinner idea), the next few days, food to use soon, what's left on the list, and recipes to cook again or added lately |
| Recipes | Cards or a compact list, with search, diet, tag and time filters, sorting, and tag management. Cards are drawn a page at a time as you scroll |
| Recipe | Detail page with a servings scaler, ingredients, steps, nutrition, and buttons for Cook, Edit, Tidy up, Made it and History |
| Cook | Full-screen cooking: a get-ready checklist, then a step at a time with that step's ingredients, timers and a text size. `?entry=` (from the plan or Today) makes Done cooking mark that meal cooked |
| Add | Link, Text, Photo and Manual tabs |
| Review | A queue of AI proposals waiting for you, such as bulk cleanup results |
| Find recipes | Tabs for starter collections (photo cards; a collection's page lists its recipes with Import and Import all) and Discover with AI (a theme box, ideas, results and earlier searches) and Sites (newest recipes from followed sites, filterable by site, with following and suggestions to the side). `?tab=` picks the tab, `?search=` the search shown and `?site=` the site |
| Plan | Week view with Fill the week, re-roll, Suggest something else, mark cooked/skipped, Add to list, and calories per day |
| List | Shopping list grouped by section, with every-week items, always-on-hand items and a **Shop** menu: Send to Fry's (`/list/shop`: each item's Fry's product, packages, prices and sales, a total, then add to the cart) and Shop at Costco (`/list/costco`: each item linked to its Costco Same-Day search, `sameday.costco.com/store/costco/s?k=`) |
| Pantry | Use soon (near use-by dates, and fresh leftovers from skipped meals), everything else by aisle, and always-on-hand items |
| Chat | Available on every screen (see below) |
| Settings | Your account and appearance; your household (members, invites, rename, tidying up, which meals to plan and the first day of the week); nutrition for the whole library; for the server admin, the server (sign-up, households), AI (keys, models, usage by household), the USDA key and the Mealie import; later the API token and plan rules |

### Layout

- **Phone:** a bottom tab bar (Today, Recipes, Plan, List, Pantry) and a floating chat button. Chat opens as a full-height bottom drawer.
- **iPad and desktop:** a sidebar for navigation. Chat opens as a side panel next to the recipe or cook view, so you can read and ask at the same time.
- **Using a wide screen:** pages fill the width rather than keeping a phone-width column. Today, the List and the Pantry have a side column of panels (`components/layout/page-layout.tsx`: what's next and to use soon, how the shop is going and what it's for, Use soon and Always on hand). The List's and Pantry's aisles, and the Plan's days, flow into two or three columns like a paper planner. Settings has its sections listed down the side, following along as you scroll.

### shadcn/ui components we expect to use

- **Basics:** Button, Card, Input, Textarea, Badge, Checkbox, Separator, Skeleton, Scroll Area
- **Navigation and overlays:** Tabs, Dialog, Drawer (bottom sheets on phone), Sheet (side panels on iPad and desktop), Dropdown Menu, Command (search and quick add)
- **Input and feedback:** Form, Select (provider and model pickers), Calendar and Popover (plan dates), Toggle Group, Progress (bulk jobs), Sonner (toasts)

### Look

- shadcn's CSS-variable theming in light and dark. Dark matters for cooking at night.
- Warm palettes, with a serif (Fraunces) for headings to give a cookbook feel.
- There are three palettes: Sage & Cream (the default), Paprika & Linen, and Cast Iron & Saffron. All of them pass WCAG AA contrast. Tokens and how to change them are in [development.md](development.md#theme).

### Proposal previews

New recipes show as a recipe card. Edits show a before/after view for each section, with checkboxes for which sections to apply.

### Cook view

- Uses the Screen Wake Lock API to keep the screen on.
- Step by step with swipe, or the full list.
- An ingredient checklist with scaled quantities.
- Ingredients used in the current step are highlighted.
- Inline timers.
- The chat button stays visible.

### Home-screen app

- A web app manifest and icons make Mise installable.
- A service worker for reading recipes offline comes later.
