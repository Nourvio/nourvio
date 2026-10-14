# Roadmap

Each milestone ends with something usable. Mealie keeps running until milestone 3 replaces it for day-to-day use.

## Milestone 0: Foundation

**Done:**
- The npm workspace, with `apps/web` and `apps/server`
- Vite, React and shadcn/ui (Radix, Maia style), Tailwind v4
- Three palettes in light and dark, checked for contrast
- The app shell: sidebar on iPad and desktop, tabs on phone, chat launcher, Settings
- Placeholder pages and the `/styleguide` page
- A Hono server that serves the web app and `/api/health` (with a Postgres check)
- A Dockerfile, plus a compose stack (app, Postgres, nightly backup, optional tunnel) that builds straight from GitHub
- GitHub Actions: typecheck, lint, format, contrast and build checks, plus a Docker build

**To do:**
- Add `packages/shared` to the workspace
- Postgres and Drizzle:
  - migrations run at startup
  - the `pg_trgm` extension
  - seeded units and store sections
  - PGlite for tests
- Accounts, sessions, the admin role, the first-run setup code, and login rate limiting
- Save each person's appearance (mode and palette) to their account instead of only on the device
- A web app manifest and home-screen icons. The favicon already exists.

**Done when:** you can sign in at the public URL from a phone, through the tunnel, and see the empty app shell running in Dockge on the home server. A nightly dump should appear in `data/backups`.

## Milestone 1: Recipes and AI basics

- Recipe tables, CRUD, tags, rating, "I made this" and version history with restore
- The shared ingredient parser, quantity scaling and fraction display
- **AI providers:**
  - the provider interface, with Claude and OpenAI implementations
  - Settings → AI: keys (environment or encrypted in the database), Test button, default model, per-task models
  - usage and cost tracking
- **Import:**
  - From a URL: JSON-LD first, then AI fallback, with the image downloaded
  - From pasted text and photos, using AI
  - Manual entry
  - Mealie, with images
- **AI cleanup:**
  - the Tidy up button, with options for ingredients, steps, tags, description and missing details
  - before/after proposals
  - a setting to run it automatically after import
  - bulk cleanup as a background job through the batch APIs, feeding a Review queue
- Recipes grid, the recipe page and the servings scaler
- Cook view: wake lock, step by step with swipe, ingredient checklist, highlighted step ingredients, inline timers
- Nutrition shown when a site provides it

**Done when:**
- the whole Mealie library is in Mise, bulk-cleaned and tagged, with the proposals reviewed
- a meal is cooked start to finish from the iPad cook view
- AI import works with both a Claude key and an OpenAI key

## Milestone 2: AI assistant

- A streaming chat panel: a drawer on phone, a side panel on iPad
- Page context (current recipe and servings, current week)
- Read tools: search recipes, get recipe, list tags
- Proposal tools: new recipe, recipe edit and cleanup, with preview cards and Apply
- Saved conversations, each pinned to the provider and model it started with

**Done when:** on a recipe page you can ask "no buttermilk, what can I use?", get an answer, and save the result as a variant in one tap. It should work the same with Claude and with OpenAI.

## Milestone 3: Meal plan and shopping list

- Week view: add a recipe or note, mark cooked or skipped
- Plan rules, rules-based "Suggest week," and re-roll
- AI plan suggestions, with plan proposals in chat
- Generating the list from the plan: combine ingredients, convert units, group by store section
- Manual items, check-off, and list proposals in chat

**Done when:** a full week is planned and shopped from the generated list. This is the point where Mise replaces Mealie day to day.

## Milestone 4: Pantry

- Food matching: fuzzy suggestions with `pg_trgm`, a UI for confirming once, and AI matching during cleanup
- Pantry with amounts, staples, and the low/out flags
- Checked list items flow into the pantry, reserved for their meals
- Cooking a meal uses up its ingredients. Skipping releases them as leftovers to use.
- Use-by dates and the "use soon" list
- Lists subtract the pantry, and suggestions favor leftovers and food that needs using soon

**Done when:** skipping Tuesday's meal makes next week's suggestions use its ingredients, and the list doesn't include what's already in the pantry.

## Milestone 5: Nutrition

- USDA FoodData Central matching for foods, with nutrient and portion caching
- Per-serving calculation, with the source label (site, calculated or estimate)
- AI estimate fallback
- Daily and weekly totals on the plan

**Done when:** every recipe shows per-serving nutrition with its source.

## Milestone 6: Walmart

- Store product mappings (food → Walmart product) managed in Mise
- AI translation of list amounts into product quantities
- A Manifest V3 extension: fetch the list, add mapped items, pick and save unmapped items, show a summary
- A personal API token in Settings
- Product links on the List screen as the fallback

**Done when:** after the first week's mappings, a week's list lands in the Walmart cart in about two minutes with only a few manual picks.

## Later, maybe

- Meaning-based recipe search with `pgvector` ("something cozy with chicken")
- Offline reading in the cook view (a service worker)
- Barcode scanning for the pantry
- Hands-free voice in the cook view
- Multiple shopping lists
- Price tracking from Walmart summaries
- A Kroger Cart API integration, if switching stores
- A ChatGPT/Claude app connector (MCP). We dropped this in favor of in-app chat, but the service layer would make it easy to add (see [integrations.md](integrations.md#considered-and-dropped-chatgpt-and-claude-app-connectors-mcp)).

## Open questions

| # | Question | Recommendation | Affects |
|---|---|---|---|
| 1 | Is Walmart the long-term store, or is a Kroger-family store an option? | Walmart for now. Kroger would make milestone 6 much sturdier. | M6 |
| 2 | One shared household login, or one account per person? | One per person. It costs about the same and records who changed what. | M0 |
| 3 | Do you have a domain on Cloudflare for the tunnel? | Needed for the recommended setup | M0 |
| 4 | Dinners only, or breakfast and lunch too? | Dinners by default, with other meals optional | M3 |
| 5 | Should AI keys be shared by the household, or should each person bring their own? | One set for the household, managed by the admin | M1 |
| 6 | Should cleanup run automatically on every import, or only when you tap Tidy up? | Off by default to start. Turn it on once the results are trusted. | M1 |
| 7 | Public or private GitHub repo? | Either works. Private needs registry credentials on TrueNAS. | M0 |
| 8 | How many recipes are in Mealie, and anything special in there (custom fields, categories you rely on)? | Check before building the importer | M1 |
| 9 | A monthly AI spending cap? | Show usage from day one and add a cap if needed | M1 |
