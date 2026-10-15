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

**Status:** built. The AI estimate, the library run and the plan totals were tested live with Claude. The USDA calculation is tested against real USDA records and search results; it gets its first live run once a USDA key is added in Settings.

- USDA FoodData Central matching, with the AI picking from the search results (USDA's top hit is often the wrong food), and nutrients, portions and matches cached server-wide
- Per-serving calculation, with the source label (site, calculated or estimate) and the lines that weren't counted
- AI estimate fallback, on a small model by default
- Worked out in the background after a save, on demand from the recipe page, and for the whole library from Settings
- Daily and weekly totals on the plan, per person

**Done when:** every recipe shows per-serving nutrition with its source.

## Milestone 6: Store connections and the Mise extension

**Status:** built October 14, 2026, steps 1 to 5 (1 and 2 in one commit), and checked for real by the user: a Fry's cart sent through their own Kroger app (which led to counting packs by what's in them), and the extension in Chrome picking Walmart products and filling the Walmart cart. The research is in [integrations.md](integrations.md#grocery-stores-connections). Decided with the user:

- **Stores:** Fry's, Costco and Walmart.
- **How each connects:** Fry's through Kroger's official cart API, and Walmart through a Mise browser extension, which also takes on other jobs like importing a recipe from any page. Costco was going to be an Instacart shopping link, but the user found Instacart's Developer Platform isn't open to the public, so Costco gets links to each item at Costco Same-Day, plus the extension's list side panel.
- **Accounts:** one linked store account per household, so one shared cart.
- **Autopilot:** the weekly autopilot plans the week and builds the list, then waits. You review and tap Send; it never fills a cart by itself.

Build order, a commit for each:

1. **The shopping foundation:**
   - A product for each list item at each store, picked once and remembered (`store_products`).
   - Amounts turned into packages.
   - A review screen: products, packages, prices and sales, swap or skip, and a total.
2. **Fry's:**
   - Settings → Connections: the server admin adds the Kroger app's keys, and a household admin links the household's Fry's account and picks the store.
   - **Send to Fry's** from the review.
   - Store prices and sales, and the list sorted by Fry's aisles for shopping in person.
   - After the autopilot runs, Today says "Next week is planned" and links to the review.
3. **Costco:** the list for Costco, each item linked to its search at Costco Same-Day, checked off as you add them there.
4. **The Mise extension, part one (any site):**
   - Connect it to your Mise.
   - Import the recipe on the page you're looking at. This works on sites that block Mise's server, and on recipes you can see through your own subscription.
   - Right-click a link or video to import it, or selected text to add it to the list.
   - Keep the week's list in a side panel while shopping any store's site, checking items off as you go.
5. **The Mise extension, part two (Walmart):**
   - Pick a product on any Walmart page for a list item ("use this for milk"), price included.
   - Fill the Walmart cart with the week's list: one item at a time, asking about items without a product yet, and ending with a summary and an estimated total.
6. **Later:** plans that lean on Fry's sales, and Costco-size packs for warehouse trips.

**Done when:**
- After the first week's product picks, a week's list lands in the Fry's cart in a couple of minutes, and in the Walmart cart through the extension.
- A Costco order is a few taps per item, straight from the list.
- A recipe on a site that blocks Mise imports in one click from the extension.

**Still open:** where the extension is installed from: downloaded from Mise and loaded unpacked, or a Chrome Web Store listing (see [integrations.md](integrations.md#the-mise-browser-extension-planned)).

## Milestone 7: A smarter assistant

**Status:** built October 14, 2026, a commit for each, in this order. Live checks: tastes (the assistant offered to remember a dislike), a cooking note turned into a precise edit, swaps for cream with a pantry pick, and web search offering three real recipes. Hands-free was checked with a stand-in recognizer, not a real microphone.

1. **Household tastes and rules:** foods to avoid (and who, and allergies), diets every meal must fit, a time limit for weeknight dinners, and notes for the assistant ("no fish on Mondays"). Fill the week, dinner ideas and the assistant follow them; recipes that break one say so; the assistant offers to remember new ones it hears.
2. **"How did it go?" after cooking:** a rating and a note when cooking finishes. Notes show on the recipe and in cook mode next time, and the AI turns a note into a suggested edit to review.
3. **Swap an ingredient:** "Out of this?" on any ingredient gives substitutes with amounts for that recipe, knowing what's in the pantry. Use one for tonight, or save it to the recipe.
4. **Find recipes online:** the assistant can search the web for real recipes and offer each as a one-tap import.
5. **Hands-free cook mode:** voice commands on the counter ("next", "back", "read it", "timer for 10 minutes", "how much garlic?"), with steps read aloud.

**Done when:** a week planned by Fill the week respects the household's rules, a note left after cooking becomes a suggested edit, an ingredient can be swapped while cooking, the assistant imports a recipe it found online, and a recipe can be cooked start to finish without touching the screen.

## Milestone 8: Autopilot and finding recipes

**Status:** built October 14, 2026, a commit for each, in this order. Live checks: a collection recipe imported (and removed again), an AI search for cozy soups found eight importable recipes in 26 seconds for about 6¢, and following RecipeTin Eats turned its four newest posts into recipes. The weekly autopilot wasn't run live, so it didn't change the real plan; tests cover it.

1. **Weekly autopilot:** on a day and time the household picks (Saturday morning, say), Mise fills the week ahead's empty meals by its rules and tastes (the free, rules-based Fill the week) and adds them to the shopping list. Today says "Next week is planned" to review. Settings has a "Run it now".
2. **Starter collections:** hand-picked sets of well-loved recipes from free sites (Weeknight dinners, Chicken, Pasta, Soups, Vegetarian, Baking...), each checked to import, browsed with photos, imported one at a time or all at once.
3. **Discover with AI:** pick or type a theme ("cozy fall soups") and the assistant finds a fresh set from good sites that fits the household, on a small model with web search.
4. **Follow recipe sites:** follow sites with feeds and see their newest recipes to import.

**Done when:** a week plans itself and its list without anyone opening the app, and a new household can fill its library from collections, discovery and followed sites without pasting a link.

## Milestone 9: Lists by store

**Status:** built October 14, 2026. The user asked to split the list, since they get soda and meat at Costco and everything else elsewhere.

- **Lists:** the household's shopping lists, each for a store (Fry's, Costco or Walmart) or for none (a party list). One is the main list, which everything goes on unless something says otherwise. A household with one list sees the List page as before.
- **Sorting itself:** each list can take aisles ("Meat & seafood and Beverages go on the Costco list"), and moving something to another list teaches Mise where that food goes, which wins over the aisle. It applies to everything added: typed in, every-week items and the plan. Saving the lists also moves what's waiting on the main list.
- **Shopping follows:** Send to Fry's, Shop at Costco and the extension's Walmart cart each use their store's list, or the lists for no store when a store has none. The extension's side panel can show one list.

**Done when:** soda and chicken land on the Costco list by themselves, and Send to Fry's sends only the rest.

## Milestone 10: A better cook-mode voice

**Status:** Part 1 built October 14, 2026; Part 2 planned. The user found hands-free cook mode's narrator robotic and asked for something like ElevenLabs, ideally free and without another API key.

Why it sounds bad today: cook mode never picks a voice, so it gets the browser's default, usually the oldest, most robotic one on the device.

**Part 1: the best voice on each device** (free, nothing to set up)
- Mise ranks the device's voices for the reading language and picks the best: Microsoft's "Natural" voices in Edge, Siri-grade "Premium" and "Enhanced" voices on Apple devices, then Google's. Novelty voices are skipped.
- The cook view's text menu gets a **Voice** choice: "Best on this device" (the default) or any good voice for the language, with **Test voice**. It's remembered on each device.
- Limits: Chrome and Firefox on Windows only have the old voices, and Apple's best ones need downloading in Settings → Accessibility → Spoken Content.

**Part 2: a server voice** (free with Kokoro, or OpenAI with the key that's already there)
- **Kokoro**: an open voice model (Apache 2.0) that sounds close to commercial ones, run as an optional container beside Mise (`ghcr.io/remsky/kokoro-fastapi-cpu`, an OpenAI-style `POST /v1/audio/speech` on port 8880). The compose file gets it as an optional service.
- **OpenAI** (`gpt-4o-mini-tts`) as the alternative, told to sound like a warm, unhurried cooking teacher: about 2 to 5¢ to read a whole recipe once, counted in AI usage.
- Settings → This server (server admin): Voice: this device's / Kokoro (its address and voice, with Test) / OpenAI (its voice).
- `POST /api/voice/speak` returns the audio for some text. Audio is saved by provider, voice and text, so each step is made once and cooking a recipe again is instant (and free with OpenAI).
- The cook view plays it, getting the next step's audio ready while the current one is read (Kokoro on an older CPU takes a few seconds to start), and pauses listening for commands meanwhile. When the server voice fails, it falls back to the device's voice.

**Done when:** cooking hands-free in Chrome on Windows sounds like a person, not a 2005 GPS, and turning the server voice off goes back to the device's best voice.

## Later, maybe

- Meaning-based recipe search with `pgvector` ("something cozy with chicken")
- Offline reading in the cook view (a service worker)
- Barcode scanning for the pantry
- Price tracking, from the prices Fry's and Walmart show when sending the list
- A ChatGPT/Claude app connector (MCP). We dropped this in favor of in-app chat, but the service layer would make it easy to add (see [integrations.md](integrations.md#considered-and-dropped-chatgpt-and-claude-app-connectors-mcp)).

## Open questions

| # | Question | Recommendation | Affects |
|---|---|---|---|
| 1 | Which stores should connections cover? | **Decided:** Fry's (Kroger's official cart API), Costco as links to Costco Same-Day (Instacart's API isn't open), and Walmart through the Mise extension. See milestone 6. | M6 |
| 2 | One shared household login, or one account per person? | **Decided:** one account per person, joining by invite link. One server can host several households. | M0 |
| 3 | Do you have a domain on Cloudflare for the tunnel? | Needed for the recommended setup | M0 |
| 4 | Dinners only, or breakfast and lunch too? | **Decided:** each household picks; dinner by default, with breakfast, lunch and snacks optional | M3 |
| 5 | Should AI keys be shared by the household, or should each person bring their own? | **Decided:** one set for the whole server, managed by the server admin, with usage shown per household. Per-household keys or spending caps could come later. | M1 |
| 6 | Should cleanup run automatically on every import, or only when you tap Tidy up? | Off by default to start. Turn it on once the results are trusted. | M1 |
| 7 | Public or private GitHub repo? | Either works. Private needs registry credentials on TrueNAS. | M0 |
| 8 | How many recipes are in Mealie, and anything special in there (custom fields, categories you rely on)? | Check before building the importer | M1 |
| 9 | A monthly AI spending cap? | Show usage from day one and add a cap if needed | M1 |
