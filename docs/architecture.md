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
│   └── extension/           Walmart cart extension (milestone 6)
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

**Food** is the central idea. A food is a shared list entry, like "yellow onion." It links:

- recipe ingredients
- pantry items
- shopping list items
- store products
- nutrition data

This lets the same onion add up across recipes, get subtracted by the pantry, and map to a Walmart product.

| Table | Key columns | Purpose |
|---|---|---|
| `recipes` | id, slug, name, description, image, source_url, servings, yield_text, prep/cook/total_minutes, notes, rating, nutrition (jsonb, per serving + source), origin, last_made_at, search (tsvector) | `origin` is one of url, text, photo, manual, chat, mealie |
| `recipe_ingredients` | recipe_id, position, section, raw_text, quantity, quantity_max, unit_id, food_id, note | `raw_text` is always kept and shown as written. The parsed fields drive scaling, lists and nutrition. |
| `recipe_steps` | recipe_id, position, section, text | |
| `recipe_versions` | recipe_id, snapshot (jsonb), source, created_by, created_at | Every saved change makes a snapshot, so the original import can always be restored. `source` is one of import, manual, ai_cleanup, chat. |
| `tags`, `recipe_tags` | | |
| `foods` | name, plural, store_section, is_staple, fdc_id, nutrition_per_100g (jsonb), grams_per_unit (jsonb) | `fdc_id` links to USDA data |
| `units` | name, abbreviation, aliases, kind (volume/weight/count), to_base | `to_base` converts to ml or g for safe unit conversion. Seeded at startup. |
| `meal_plan_entries` | date, meal, recipe_id (nullable), note, servings, status | `status` is planned, cooked or skipped |
| `plan_rules` | name, days, meal, tag filters, no_repeat_days, prefer_rating | Drives automatic suggestions |
| `shopping_lists` | name, week_of, created_at | |
| `shopping_list_items` | list_id, food_id, text, quantity, unit_id, store_section, checked, for_entries (jsonb), store_product_id | `for_entries` records which planned meals an item was bought for |
| `pantry_items` | food_id, quantity, unit_id, status, bought_at, use_by, reserved_for_entry_id | `status` is have, low or out |
| `store_products` | store, food_id, product_id, name, size, purchase_unit, last_price, preferred | The ingredient-to-Walmart-product mapping |
| `proposals` | kind, target_id, payload (jsonb), created_by (chat or cleanup), status | A pending change from the AI, waiting for you to apply or dismiss it (see [AI](#ai)) |
| `chat_conversations`, `chat_messages` | provider, model, content (jsonb, in that provider's native format) | A conversation stays on the provider it started with, so it can resume exactly |
| `ai_usage` | provider, model, task, input/output tokens, cost, created_at | Spend tracking in Settings |
| `ai_jobs` | kind, status, progress, provider batch ids | Bulk work such as cleaning up the whole library |
| `settings` | key, value (jsonb) | Includes AI settings. API keys are stored encrypted. |
| `users`, `sessions`, `api_tokens` | | Login, and the extension's token |

### Postgres features we use

- **`jsonb`** for nutrition, chat messages, version snapshots and proposal payloads.
- **`pg_trgm`** for fuzzy matching. It matches "yellow onions, diced" to the food "yellow onion," and makes recipe search tolerant of typos.
- **Full-text search** (`tsvector`) across recipe names, ingredients, tags and steps.
- **Later:** `pgvector` for meaning-based search ("something cozy with chicken"). That needs the `pgvector/pgvector:pg18` image instead of `postgres:18`, with no other changes.

### How skipped meals work

1. Generating a list from the plan records, on each item, which planned meals it's for (`for_entries`).
2. Checking an item off moves it into the pantry, reserved for those meals.
3. Marking a meal **cooked** uses up its reserved items.
4. If a meal is marked **skipped**, or its date passes without being cooked, its reserved items are released as **leftovers to use**. The planner and the assistant favor recipes that use them.

## API

JSON over REST under `/api`. Chat streams with server-sent events.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Recipes | `GET/POST /api/recipes`, `GET/PUT/DELETE /api/recipes/:id`, `POST /api/recipes/:id/made`, `POST /api/recipes/:id/image` |
| Versions | `GET /api/recipes/:id/versions`, `POST /api/recipes/:id/versions/:versionId/restore` |
| Import | `POST /api/import/url`, `/text`, `/photo`, `/mealie` |
| AI cleanup | `POST /api/recipes/:id/cleanup` (returns a proposal), `POST /api/recipes/cleanup` (bulk job) |
| Proposals | `GET /api/proposals/:id`, `POST /api/proposals/:id/apply`, `POST /api/proposals/:id/dismiss` |
| Chat | `POST /api/chat` (streaming), `GET /api/chat/conversations`, `GET /api/chat/conversations/:id` |
| Jobs | `GET /api/jobs/:id` |
| Plan | `GET /api/plan?week=`, `POST/PUT/DELETE /api/plan/entries/:id`, `POST /api/plan/suggest` |
| Lists | `GET /api/lists/current`, `POST /api/lists/from-plan`, `POST/PUT/DELETE /api/lists/:id/items/:itemId` |
| Pantry | `GET/POST /api/pantry`, `PUT/DELETE /api/pantry/:id` |
| Foods / units | `GET/POST /api/foods`, `GET /api/units` |
| Settings | `GET/PUT /api/settings/ai`, `POST /api/settings/ai/test`, `GET /api/settings/ai/models?provider=` |
| Store | `GET /api/store/walmart/list` (for the extension), `PUT /api/store/products/:foodId` |
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

- Features go through `ai/service.ts`, never an SDK directly. It picks the provider and model for the task, makes the call and records usage.
- **Tools are defined once**, as Zod schemas, and converted to each provider's tool format.
- **API keys:**
  - Keys come from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or **Settings → AI**.
  - An environment variable wins and shows in Settings as "Set on the server."
  - Keys saved in Settings are encrypted at rest (AES-256-GCM) with a key derived from `MISE_SECRET`, or from a random `data/app/secret` file if that isn't set. A database dump alone can't reveal them.
  - A key is tested against the provider before it's saved.
  - Keys are never sent back to the browser. Settings shows only the last four characters, with a **Test** button.
  - Only admins can change AI settings.
- **Models:**
  - Settings has a default model, picked from the providers' live model lists.
  - Each task can override that default. So far: importing, tidying and the assistant; planning, shopping translation and nutrition estimates join later.
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

- An agent loop on the server using the provider's tool calling, streamed to the browser.
- **Context goes with each message:** the screen you're on (recipe id and servings, or the week being viewed) plus a short pantry summary.
- **Read tools:** `search_recipes`, `get_recipe`, `get_meal_plan`, `get_pantry`, `list_tags`.
- **Proposal tools:**
  - `propose_recipe`: save something new from the conversation
  - `propose_recipe_edit`: substitutions, dairy-free, rewording
  - `propose_cleanup`: run cleanup on a recipe
  - `propose_plan_changes`, `propose_list_items`, `propose_pantry_update`
- Conversations are saved and can be picked up again. Switching provider starts a new conversation.

### Recipe cleanup

Imported recipes are often messy: odd formatting, run-on steps, "Enjoy!", no tags. Cleanup asks the AI to tidy a recipe and returns a proposal you review.

| Option | What it does |
|---|---|
| Ingredients | Consistent quantities and units, combined lines split ("salt and pepper"), prep notes moved after a comma |
| Steps | Reworded to be short and clear, long steps split, filler and ads removed, nothing about the method changed |
| Tags | Suggested from our existing tags first (to avoid near-duplicates like "weeknight" and "weeknights"), new tags only when nothing fits |
| Description | A one- or two-sentence summary, if missing |
| Missing details | Servings and times filled in when they can be worked out, marked as estimates |
| Foods | Ingredients matched to foods, to help lists, the pantry and nutrition |

**When it runs:**
- **On demand:** a **Tidy up** button on any recipe, with checkboxes for the options above. You can also ask in chat.
- **After import:** a setting to run it automatically. The proposal is waiting when the import finishes.
- **In bulk:** over the whole library, for example right after the Mealie import. This is a background job with progress in `ai_jobs`. Bulk runs can use the provider's batch API, which costs half as much and usually finishes well within a day. The results arrive as a review queue of proposals.

The original is always kept. Every applied cleanup adds a version, and the first imported version can be restored.

### Other AI jobs

- **Structured extraction (import):** turns a web page without recipe data, pasted text, or photos into a recipe draft. The draft's ingredient lines and steps go through the same parser as everything else.
- **Week suggestions:** the rules pick candidate recipes. Then the AI ranks and fills the week, weighing the pantry, leftovers, use-by dates and preferences.
- **Shopping translation:** turns combined recipe amounts into product quantities, using our saved Walmart products.
- **Nutrition fallback:** an estimate when USDA matching fails, always labeled as an estimate.

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
- When a food or unit isn't recognized, the line still saves. It just won't combine on lists until it's matched. The UI lets you match it once, or AI cleanup can match it.

## Auth

- **Accounts:** household members sign in with a username and password, hashed with scrypt.
- **Sessions:** 90-day session cookies, renewed as they're used, so the kitchen iPad stays signed in. They're `HttpOnly` and `SameSite=Lax`, plus `Secure` over HTTPS. The database stores only a hash of each token.
- **Rate limiting:** 5 failed sign-ins per username and 20 per IP, per 15 minutes.
- **First run:** the first account is created with a one-time setup code printed in the server log.
- **Roles:** an admin manages members, AI settings and API keys.
- **Extension:** uses a personal API token created in Settings.
- **Recipe import safety:** the server refuses to fetch private-network addresses. This stops someone from using the import feature to reach other machines on the home network.

## UI

### Screens

| Screen | Purpose |
|---|---|
| Recipes | Grid with search and tag filters |
| Recipe | Detail page with a servings scaler, ingredients, steps, nutrition, and buttons for Cook, Edit, Tidy up, Made it and History |
| Cook | Full-screen cooking view |
| Add | Link, Text, Photo and Manual tabs |
| Review | A queue of AI proposals waiting for you, such as bulk cleanup results |
| Plan | Week view with Suggest week, re-roll and mark cooked/skipped |
| List | Shopping list grouped by section, with Send to Walmart |
| Pantry | On hand, use soon, leftovers to use, staples |
| Chat | Available on every screen (see below) |
| Settings | Household members, AI (keys, models, auto-cleanup, usage and cost), API token, plan rules |

### Layout

- **Phone:** a bottom tab bar (Recipes, Plan, List, Pantry) and a floating chat button. Chat opens as a full-height bottom drawer.
- **iPad and desktop:** a sidebar for navigation. Chat opens as a side panel next to the recipe or cook view, so you can read and ask at the same time.

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
