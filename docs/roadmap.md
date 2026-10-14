# Roadmap

Each milestone ends with something usable. Mealie keeps running until milestone 3 replaces it for day-to-day use.

## Milestone 0: Foundation

**Status:** built and tested locally. All that's left is deploying it on the home server and checking the "done when" below.

- The npm workspace: `apps/web`, `apps/server` and `packages/shared`
- Vite, React and shadcn/ui (Radix, Maia style), Tailwind v4
- Three palettes in light and dark, checked for contrast
- The app shell: sidebar on iPad and desktop, tabs on phone, chat launcher, account menu
- Placeholder pages and the `/styleguide` page
- A Hono server that serves the web app and `/api/health` (with a Postgres check)
- Postgres and Drizzle:
  - migrations run at startup
  - the `pg_trgm` extension
  - seeded units and store sections
  - tests on PGlite
- Accounts:
  - the first-run setup code
  - sign-in with rate limiting, and 90-day sessions
  - the admin role, and adding, removing and resetting household members
  - changing your own name and password
- Each person's appearance (mode and palette) saved to their account
- A web app manifest and home-screen icons
- A Dockerfile, plus a compose stack (app, Postgres, nightly backup, optional tunnel) that builds straight from GitHub
- GitHub Actions: typecheck, lint, format, contrast, tests and build checks, plus a Docker build

**Done when:** you can sign in at the public URL from a phone, through the tunnel, and see the empty app shell running in Dockge on the home server. A nightly dump should appear in `data/backups`.

## Milestone 1: Recipes and AI basics

**Status:** built. That covers:
- recipes, the recipe page, editor, cook view and version history
- importing from recipe-site links, including links shared to the installed app
- AI providers (keys, models, usage), with import from pasted text, photos and pages without recipe data
- TikTok, YouTube and Instagram links
- Tidy up with section-by-section review, auto-tidy after import and library runs
- the Mealie import
- several households per server, invite links and optional open sign-up

What's left is checking the "done when" below with real keys and the real Mealie library.

- Recipe tables, CRUD, tags, rating, "I made this" and version history with restore
- The shared ingredient parser, quantity scaling and fraction display
- **AI providers:**
  - the provider interface, with Claude and OpenAI implementations
  - Settings → AI: keys (environment or encrypted in the database), Test button, default model, per-task models
  - usage and cost tracking
- **Import:**
  - From a URL: JSON-LD first, then AI fallback, with the image downloaded
  - From TikTok, YouTube and Instagram links: caption, transcript and frames, read by AI
  - From pasted text and photos, using AI
  - Manual entry
  - Mealie, with images
- **AI cleanup:**
  - the Tidy up button, with options for ingredients, steps, tags, description and missing details
  - before/after proposals
  - a setting to run it automatically after import
  - bulk cleanup as a background job feeding a Review queue (the cheaper batch APIs come later)
- Recipes grid, the recipe page and the servings scaler
- Cook view: wake lock, step by step with swipe, ingredient checklist, highlighted step ingredients, inline timers
- Nutrition shown when a site provides it

**Done when:**
- the whole Mealie library is in Mise, bulk-cleaned and tagged, with the proposals reviewed
- a meal is cooked start to finish from the iPad cook view
- AI import works with both a Claude key and an OpenAI key

## Milestone 2: AI assistant

**Status:** built. Tested live with Claude: it answers with the on-screen recipe and its scale in mind, looks things up, makes edit and new-recipe cards, saves variants, and continues saved conversations. OpenAI's chat path is written against its SDK but hasn't been run with a real key yet.

- A streaming chat panel: a drawer on phone, a side panel on iPad
- Page context (current recipe and servings, current week)
- Read tools: search recipes, get recipe, list tags
- Proposal tools: new recipe, recipe edit and cleanup, with preview cards and Apply
- Saved conversations, each pinned to the provider and model it started with

**Done when:** on a recipe page you can ask "no buttermilk, what can I use?", get an answer, and save the result as a variant in one tap. It should work the same with Claude and with OpenAI.

## Milestone 3: Meal plan and shopping list

**Status:** built. Tested in the browser: planning dinners and notes, Fill the week with re-roll, swapping a planned meal, adding a week to the list (combined amounts, every-week items, always-on-hand left off) and checking items off. The assistant filled a week's dinners from the Plan page with Claude.

- Week view: add a recipe or note, mark cooked or skipped, with the household choosing its meals and first day of the week
- Rules-based "Fill the week," re-roll, and "Suggest something else"
- The assistant reads the plan and list, knows the week on screen, and proposes meals and list items as cards
- Adding a week to the list: combine ingredients, convert units, group by store section, leave out always-on-hand items
- Every-week items, typed items, check-off, and remembered sections
- *Moved later:* saved plan rules and AI-ranked week suggestions (once the pantry gives them something to weigh)

**Done when:** a full week is planned and shopped from the generated list. This is the point where Mise replaces Mealie day to day.

## Milestone 4: Pantry

**Status:** built. Tested in the browser: adding a week to the list left off what was in the pantry, Put away filled the pantry, skipping a dinner put its fresh groceries under Use soon, and next week's Fill the week led with a recipe that "uses up your lemon".

- Pantry by aisle with rough amounts, use-by guesses for fresh food, and a "Use soon" list
- Put away on the List moves bought items into the pantry, remembering their meals
- Cooking a meal uses up its ingredients, and un-cooking puts them back. Skipped meals' fresh groceries show as leftovers to use.
- Lists subtract the pantry; Fill the week uses up what needs using first; the assistant reads the pantry
- Always-on-hand items go on the list from the Pantry page when they run low
- *Changed:* no foods table or "confirm this match" screen. Matching uses normalized food names (prep and quality words dropped), which needs no setup. A foods table can still come with nutrition if it earns its keep.

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
| 2 | One shared household login, or one account per person? | **Decided:** one account per person, joining by invite link. One server can host several households. | M0 |
| 3 | Do you have a domain on Cloudflare for the tunnel? | Needed for the recommended setup | M0 |
| 4 | Dinners only, or breakfast and lunch too? | **Decided:** each household picks; dinner by default, with breakfast, lunch and snacks optional | M3 |
| 5 | Should AI keys be shared by the household, or should each person bring their own? | **Decided:** one set for the whole server, managed by the server admin, with usage shown per household. Per-household keys or spending caps could come later. | M1 |
| 6 | Should cleanup run automatically on every import, or only when you tap Tidy up? | Off by default to start. Turn it on once the results are trusted. | M1 |
| 7 | Public or private GitHub repo? | Either works. Private needs registry credentials on TrueNAS. | M0 |
| 8 | How many recipes are in Mealie, and anything special in there (custom fields, categories you rely on)? | Check before building the importer | M1 |
| 9 | A monthly AI spending cap? | Show usage from day one and add a cap if needed | M1 |
