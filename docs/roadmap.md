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
6. **Later:** plans that lean on Fry's sales (now milestone 11), and Costco-size packs for warehouse trips.

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

**Status:** built October 14, 2026. Tested with a stand-in Kokoro and OpenAI (the real Kokoro container runs once the Dockge stack is redeployed). The user found hands-free cook mode's narrator robotic and asked for something like ElevenLabs, ideally free and without another API key.

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

## Milestone 11: Fry's sales

**Status:** built October 14, 2026, and checked against the user's real Fry's. The user shops at Fry's every week and picked this from milestone 6's "Later": plans that lean on what's on sale.

Found while building: Kroger does give a sale's end date (`price.expirationDate`), so "through Tue" shows. The AI picker used to skip a lone search result ("garlic clove" turned up only garlic crackers, which were kept); it now checks those too, sees sale prices, and the daily check gives Mise's own picks a fresh look each week, for one on sale.

What's there today: Kroger's product API gives a store's regular and sale price, and Mise keeps both (`StoreProduct.salePrice`). But prices are only refreshed when the cart review (`/list/shop`) opens, so the List shows whatever was seen last, and planning never looks at them.

**1. Fresh prices, every day** (no new keys, a handful of Kroger calls)
- Once a day, early morning in the household's time zone, Mise refreshes the price of every remembered Fry's product, 50 to a call. It also refreshes right before the weekly autopilot plans, so the plan sees this week's sales.
- Recipe ingredients never bought at Fry's: Mise searches Fry's once for each **meat, seafood and produce** food in the household's recipes (the sales that change what's for dinner) and remembers its pick as a suggestion, exactly as the cart review does: the AI picks when it's set up (a fraction of a cent a batch), else the first in stock. From then on it's refreshed with the rest. At most 50 new searches a day, so a big library catches up over a few days.
- Kroger allows an app 10,000 product calls a day; this uses well under 100.
- Every price seen is saved by day in a new `store_prices` table (household, store, product, day, regular price, sale price, and when the sale ends if Kroger says), from the daily check, the cart review, product picks and the Walmart extension.

**2. Sales on the List**
- An item on sale gets a **Sale** badge and what it saves ("save $1.30"). Each store card adds up the week's savings: "Saving about $8.40 at Fry's".
- A good price says so, from the history: "usually $4.29" (the most common regular price over the past 90 days, once there are a few weeks of it). The cart review shows the same, and it works for Walmart prices the extension has seen.
- When Kroger gives the sale's end date, it shows: "Sale through Tue". The public API's field for it is read defensively; without it, no date.

**3. Plans that lean on sales**
- Fill the week and the weekly autopilot nudge a recipe up for each of its main ingredients on sale. Meat and seafood count most, produce less. It's added to the rules already there (ratings, quick weeknights, use-soon food first), so a favorite still beats a so-so recipe with cheap chicken.
- A household setting under Tastes: **Lean on sales**: off, a little (the default), or a lot.
- Suggestions say why: a "Thighs on sale" chip next to "Uses spinach", in Fill the week and Today's ideas card.
- Recipes gets an **On sale** quick filter: recipes that use something on sale at Fry's this week, with the sale foods on each card.

**Not in this milestone:** Kroger's digital coupons (the public API doesn't offer them), Costco (no prices to read), and planning around Walmart deals (Mise only sees Walmart prices when the extension does).

**Done when:** the List shows this week's Fry's sales and savings without opening the cart review, a week the autopilot plans uses more of what's on sale and says so, and a sale item shows what it usually costs.

## Milestone 13: Shopping together, theme nights, costs and receipts

**Status:** started October 14, 2026. The user picked these four from the list of ideas.

**1. Shopping together**
- The List updates live on every phone in the household: check off bananas and they're checked on Jamie's phone a moment later. Items added, changed or removed show up the same way.
- "Jamie is on the list too" shows while someone else has it open, so you know you're shopping together.
- **How:** a server-sent events stream per household (`GET /api/events`); list changes publish an event and each open List refetches. No new service, and it works through the Cloudflare tunnel.

**2. Theme nights**
- Each weeknight can have a theme in Settings → Meal plan: tacos, pasta, pizza, meatless, fish, something new, quick, leftovers or eat out (left empty), or any tag.
- Fill the week and the weekly autopilot only suggest dinners that fit the night's theme: tagged with it or named for it, vegetarian for meatless, fish or seafood for fish, never made for something new. When nothing fits, the night gets the usual suggestion and says so.
- The Plan shows the theme on each night ("Taco night"), and Fill the week says why.

**3. Cost per serving**
- Each recipe's cost from the products Mise remembers at your stores: what the recipe uses of each package (2 tbsp of a $9 bottle of oil is about 30¢), at today's price. Always-on-hand items don't count.
- Shown on the recipe ("About $9.60, $2.40 a serving"), on recipe cards, and as the week's total on the Plan. Until every ingredient has a product it says how many are priced ("8 of 10 ingredients").
- An optional weekly grocery budget (Settings → Meal plan): the Plan shows the week against it, and Fill the week leans toward recipes that fit what's left.
- The daily price check goes on to look up the rest of the recipe foods, most used first, so more recipes get a full price.

**4. Receipts into the pantry**
- **Scan a receipt** on the Pantry page: a photo, a screenshot, a PDF, or pasted text from an emailed receipt. The AI reads the items ("GV WHL MLK 1GAL" is whole milk) and a review lists them: food ticked to go in the pantry, household things left out, and anything on the shopping list checked off with it.
- **Sharing a receipt to Mise:**
  - **Android:** Mise, installed to the home screen, shows up in the share sheet. A small service worker hands the shared file to the review.
  - **iPhone:** apps on the home screen can't be in Apple's share sheet (only App Store apps can), but a Shortcut can. Settings has a **Send to Mise** guide: a few steps in the Shortcuts app with a key Mise makes for it. After that, Share → Send to Mise from Mail, Photos or Files opens the review. Once it's made, it can be shared as an iCloud link (to parents, say).

## Milestone 12: On the home screen, with reminders

**Status:** planned October 14, 2026, and on hold: the user wants it documented and built later. The user wants a morning nudge like "pull the chicken out", and a one-tap way to put Mise on the home screen that their parents could manage.

Choices made in the plan, open to change when it's picked up: frozen food is known from a new **In the freezer** toggle in the pantry (otherwise thaw reminders could only guess), and reminder times are per person, so only whoever cooks gets them.

What's there today: a web app manifest (name, icons, standalone), so phones can already add Mise to the home screen, but only if you know where to look. There's no service worker, so no notifications.

**Part 1: "Add to home screen", made easy**
- **Android, and Chrome or Edge on a computer:** an **Install Mise** button that opens the browser's own install prompt (`beforeinstallprompt`). One tap, then Install.
- **iPhone and iPad:** Safari has no install prompt, so the button opens a short guide with pictures: tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**. It points at where the Share button is in Safari and in Chrome.
- **Where it shows:** a card on Today on phones that haven't installed it ("Put Mise on your home screen: it opens like an app, and can remind you to thaw the chicken"), dismissed for good with one tap. It's also always in the account menu and in Settings → You. Once installed it disappears (detected with `display-mode: standalone`).
- The installed app opens on Today (the manifest's `start_url` is still `/recipes`).

**Part 2: Notifications**
- **What you get, each one switchable per person:**
  - **Morning, at a time you pick (8:00 by default):** today's prep. "Tonight: Lime-Garlic Chicken Thighs. Take the chicken thighs out of the freezer." Also marinating that has to start this morning.
  - **Evening, the night before (7:30 pm by default):** overnight prep for tomorrow, like "Soak the black beans" or "Move the roast to the fridge to thaw". Only sent when there's something to do.
  - **Time to start cooking:** dinner's start time worked out from its total time and a household dinner time (6:30 pm by default). "Start the tacos now to eat at 6:30."
  - Nothing is sent on days with nothing to do.
- **Knowing what needs doing ahead** (once per recipe, when it's saved, and in the background for the rest of the library):
  - Rules catch the common ones in the steps: marinate or brine for N hours or overnight, soak overnight, chill or refrigerate overnight, let rise, "the day before", "make ahead".
  - With AI set up, the small model also reads the steps for the less obvious ones ("make the dough a day ahead") and says how long each needs. It costs a fraction of a cent per recipe.
  - **Thawing:** the pantry gets an **In the freezer** toggle (and a quick "Freeze" when putting groceries away). Frozen food a meal uses gets a thaw reminder: the morning of for most things, the evening before for big cuts (a roast, a whole chicken, 3 lb or more). Meat that isn't in the pantry at all gets a softer line in the morning note: "Uses chicken thighs: thaw them if they're frozen."
- **Turning it on:** Settings → You → **Notifications**: **Turn on for this device** (the browser asks first), which reminders you want and when, the devices that get them, and **Send a test**.
- **How it works:** a service worker shows the notifications. The server signs them with its own keys (VAPID, made on first use and stored encrypted; no outside account) and sends them through each browser's push service with the `web-push` library. Subscriptions are kept per person and device, and ones the browser says are gone are removed. A scheduler checks every 5 minutes in each household's time zone, and what was sent is remembered so nothing goes out twice.
- **Limits worth knowing:**
  - On iPhone, notifications only work once Mise is on the home screen (iOS 16.4 or later), which is why Part 1 comes first.
  - Notifications need Mise opened at its https address (the Cloudflare tunnel), not a local http one. The settings card says so when it's opened over http.
  - Later, the same notifications could cover list changes ("Jamie added milk") and "An update is ready".

**Done when:** the user's parents can put Mise on their phone's home screen from one button and its instructions, and on a day with frozen chicken planned for dinner, a notification at 8 a.m. says to take it out.

## Later, maybe

- A site that shows Mise off, like Mealie's: what it does, screenshots or a demo, and how to set it up. The code is AGPL-3.0 (October 14, 2026), so anyone can self-host it.
- Meaning-based recipe search with `pgvector` ("something cozy with chicken")
- Offline reading in the cook view (a service worker)
- Barcode scanning for the pantry
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
