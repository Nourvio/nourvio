# Product

## Why build this

Today we use Mealie. It handles recipes, plans and lists well, but it falls short where it matters most to us:

- **AI isn't part of how we cook in it.** The real workflow is chatting with ChatGPT for ideas and substitutions, then copying the results over by hand.
- **Mealie's pantry is a yes/no flag.** It doesn't know amounts, and it doesn't know about food bought for a meal that got skipped.
- **There's no way to send a list to a store.**
- **Nutrition is typed in by hand.**

Mise puts an AI assistant at the center and builds planning, pantry and shopping around it.

## Who uses it

- **Households.** Everyone in a household shares one recipe library, plan, pantry and list. One server can host several households (say, yours and your parents'), each kept separate.
- **While cooking:** a phone or iPad on the counter.
- **While planning and editing:** any device, including a desktop.

## Features

### 1. Recipes

- Each recipe has:
  - a name, photo and description
- **Photos:** imports keep the site's best photo (see [integrations.md](integrations.md#recipe-sites)). A recipe without one (typed in, pasted, from the assistant) can get one made by AI, with an OpenAI key:
  - All in one house style, so the library looks like one cookbook: a matte charcoal plate (or a dark bowl for soups, noodles and the like) on white marble, in soft daylight, at a 45° angle. The prompt names the dish, its description, what's in it and how it's finished.
  - Made by itself for each new recipe that comes without a photo (the server admin can turn this off), with a "Make a photo" button on any recipe without one, and **Make N photos** in Settings for the rest of the library (about 1¢ each).
  - Marked "AI photo" on the recipe, and never replaces a real one. Another go is in the recipe's menu.
  - servings and yield
  - prep, cook and total time
  - ingredients and steps, both with optional sections ("For the sauce")
  - tags and notes
  - a source link
  - a rating
  - nutrition
- Scaling servings updates every quantity. US units show as fractions (1 ½ cups, not 1.5).
- **Grams:** an "As written / Grams" switch on the recipe and in the cook view shows cups, spoons, ounces, sticks of butter and can sizes in grams, which is better for baking. It's remembered on each device and scales with servings.
  - When the recipe gives its own weight ("1½ cups plus 1 Tbsp. (200 g) flour"), that's what's shown.
  - Otherwise baking staples use the weights bakers go by (all-purpose flour 120 g a cup, packed brown sugar 213 g, butter 227 g), and other foods use USDA portions or what nutrition has learned.
  - Counts like "2 eggs" stay as written, as does anything without a known weight.
- "I made this" records when a recipe was cooked. This feeds the planner and the pantry.
- **Out of something?** Each ingredient on the recipe page and in the cook view has a swap button. It suggests a few substitutes that work in that recipe, as ingredient lines with amounts (so they scale), what's in the pantry first and nothing the household avoids, each with a line on how to use it ("Stir in after blending; lighter and less rich"). **Use this time** swaps it on screen and into cooking, with an Undo; **Save to recipe** changes the recipe, with Undo (the old version stays in History). Swaps run on a small model by default.
  - Amounts follow the scale being cooked, the "Instead of …" line and the swap's title too (in grams when that's on).
  - The steps follow the swap: where a step names the old ingredient, it says the new one, marked ("whisk together the tahini"), on the recipe page, in the cook view and when read aloud. Another ingredient's name is left alone ("butter" isn't swapped inside "peanut butter").
  - **When a swap changes how it's made,** the suggestion says so and does it: tomato sauce for tomato paste comes with the step rewritten ("simmer 12 to 15 minutes, until thick" instead of 3) and a pinch of sugar as an extra line, and the step says when it goes in. The swap's card shows "Changes 1 step" with the new wording first; after Use this time, those steps read the new way (their timers too), marked "Changed for the swap" with Show the original. Save to recipe saves the rewritten steps too.
  - A swap is for this time: it carries between the recipe and cooking it, and goes when cooking is finished or the recipe is left for another page, so the next time starts with the recipe as written.
- **How did it go?** Finishing in the cook view asks for stars and a note ("needed more salt", "5 minutes less in the oven"); a recipe page can take one any time. Stars become the recipe's rating. Notes are listed on the recipe, and the latest shows on the cook view's get-ready page next time. With AI set up, a note comes back as a suggested change to review on the recipe ("Bumps the garlic to 4 cloves and adds a splash of balsamic at the end"); an opinion like "the kids loved it" is just kept.
- **Finding recipes in a big library:**
  - Search by name, description, tag or ingredient.
  - Filter by diet, tags (several at once, searchable, with counts) and time ("Under 30 min"), and sort by newest, name, rating, recently made or quickest. Filters show as chips you can remove, with "12 of 140 recipes", and live in the URL so a view can be bookmarked.
  - The six most used tags sit under the search as one-tap buttons with counts ("Dinner 5"), with "All" to clear them.
  - **Tags** can be renamed, merged (rename one to another's name) and deleted for the whole household, for tidying an imported library.
  - **Cards or a compact list,** remembered on each device, each saying when it was last made ("Made Oct 14"). Cards load as you scroll, so thousands of recipes open quickly, and Back from a recipe returns to the same spot. "/" jumps to the search box. Phones show two cards across.
- **From your sites,** under the search and tags, above the library, so it's seen however big the library gets: the newest recipes from the sites the household follows, one at a time in a spotlight (photo, site, when it was posted, the recipe's own short description, Import and Open on the site), moving on every 6 seconds with dots, arrows and the next four underneath. The photos and words crossfade while the card stays put at one height. It holds still while the pointer or focus is on it, has a pause button, and doesn't move at all for people who've asked their device for less motion. Recipes not in the library yet come first. It shows on "All" and folds away while searching or filtering.
  - Before any site is followed, the bottom of the library offers four to start with and a box to paste any site.
- **Goes with** (mix and match): a recipe can go with sauces, sides and the like, so "chicken + rice" or "pasta" isn't saved a hundred times over:
  - Pick particular recipes, or a whole tag ("any sauce"), so new ones join by themselves. A sauce shows what it pairs with.
  - Tap a pairing on the recipe to see the two as one: the sauce's ingredients and steps first, each under its own heading, the sauce scaled to the servings, nutrition added up and only the diet labels both share. Cooking it walks through both, and the link can be shared.
  - A pairing that becomes its own thing can be saved as a separate recipe.
  - On the plan, a meal can be "Chicken + Rice with Peanut Sauce"; see Meal planning.
- **Diet labels** (vegetarian, vegan, gluten-free, dairy-free, egg-free, nut-free) are worked out from the ingredients, with nothing to tag by hand:
  - Cautious on purpose: a label only shows when nothing in the ingredients rules it out. Plain "stock" might be chicken, soy sauce has wheat, "tortillas" are taken to be flour, and oats need to say gluten-free. Phrases like "vegetable broth", "corn tortillas", "peanut butter" and "butternut squash" are understood.
  - Each label says what ruled it out ("2 tbsp butter"), and the household can correct any recipe. Corrections stick when the recipe is edited.
  - Shown on the recipe as links to similar recipes, and available as a filter and to the assistant.

### 2. Adding recipes

| Way in | How it works |
|---|---|
| Link | Paste a URL. We read the structured recipe data most sites embed, and use AI when a site doesn't have it. Importing the same link twice offers the existing recipe instead. |
| Video | Paste a TikTok, YouTube or Instagram link. We read the caption, the captions or spoken words (transcribing needs an OpenAI key) and, for short videos, frames from the video, and AI writes up the recipe. |
| Text | Paste anything, like a ChatGPT answer or an email. AI turns it into a recipe. |
| Photo | Take one or more photos of a cookbook page or a handwritten card. AI reads them. |
| Manual | Type ingredients one per line and steps one per line. A line starting with `#` starts a section. |
| Chat | Ask the assistant to save what you just worked out together (see 3). |
| Mealie | A one-time import of the whole existing Mealie library, with images. |
| Browser extension | The Mise extension for Chrome and Edge (Settings → Browser extension): import the page you're looking at in one click, even on sites that block Mise's server or need your subscription; right-click a link to import it, or selected text to add it to the shopping list. |
| Collections | **Find recipes** (Recipes, or Add recipe → Browse collections) has hand-picked collections of well-loved recipes from free sites: Weeknight wins, Chicken, Pasta and noodles, Soups and stews, Vegetarian mains, Comfort classics, Baking, Cookies and bars, and Breakfast. Each was checked to import cleanly. Browse them with photos, import one at a time, or **Import all** (one after another, so no site is hit all at once). Recipes already in the library say so and link to it. |
| Discover with AI | Find recipes → **Discover with AI**: type what you're in the mood for ("cozy fall soups", "a new pasta") or tap an idea, and the assistant searches the web for about eight recipes that fit the household's tastes and rules, from at least a few different sites. Mise opens each one first and keeps only pages it can import, with their photo, time and a line on why it's a good pick. A search takes under a minute and costs about 6¢ (a small model plus a few web searches). The last twelve searches are kept to come back to. |
| Sites | Find recipes → **Sites**: follow a recipe site by pasting its address, or pick from suggestions that are checked to work (RecipeTin Eats, BBC Good Food, Love and Lemons, Pinch of Yum, Once Upon a Chef and more). Mise reads the site's feed every few hours and opens each new post, a few seconds apart, to keep only the real recipes (not roundups, gear reviews or news), so the page shows each site's newest recipes with photos and times, ready to import. Filter by site, or unfollow any time. A site without a feed, without recipe details, or that turns Mise away shows nothing, and says so. |

**Sharing in.** On Android, the installed app shows up in the share sheet, so a recipe page or a TikTok can be sent straight to Mise. iPhones don't let web apps do that; copy the link and use **Paste** in the import dialog (or an iOS Shortcut that opens `/recipes?url=…`).

**Cleaning up.** Imported recipes are often messy. A **Tidy up** button, or a request in chat, has the AI:

- tidy ingredient lines
- reword steps to be short and clear, without changing the method
- remove filler ("Enjoy!", life stories, ads)
- suggest tags, reusing the ones we already have
- write a short description
- fill in missing servings or times (never changing ones you've set)

You see a before/after preview and pick what to keep. Cleanup can also run automatically after every import, or over the whole library at once, for example right after moving from Mealie. The original version is always kept and can be restored.

### 3. AI assistant

The assistant is the center of the app. It's one tap away on every screen, and it knows where you are.

- **It works with Claude or OpenAI** (the company behind ChatGPT), using our own API keys added in Settings or as environment variables.
  - A default model is picked in Settings, and each task (chat, import, cleanup, planning) can use a different one.
  - API usage is billed by the provider. It isn't included in a ChatGPT or Claude subscription.
  - Settings shows what's been spent.

- **On a recipe or in the cook view,** it knows the recipe and the current servings.
  - "No buttermilk, what can I use?"
  - "Make this dairy-free."
  - "How do I know the chicken is done?"
- **It knows the pantry and the plan.**
  - "What can I make tonight with what we have?"
  - "Plan next week and use up the spinach."
- **It gives ideas.** Ask for "something with chicken thighs under 30 minutes." It suggests recipes from the library first, then new ideas you can save.
- **It finds recipes online.** "Find me a good birria recipe" searches the web (well-tested sources first, fitting the household's rules) and offers the best one to three as cards: the site, the recipe and why it's a good pick, with **Import**, **Open the page** and **No thanks**. It checks Mise can open each page before offering it, and mentions a recipe that's already in the library instead. Recipes → Add recipe → **Find one online** starts a chat for it. A search costs about a cent, plus the model reading the results.
- **It can act, with your OK:**
  - save a new recipe
  - save a variant or edit a recipe
  - add meals to the plan
  - add items to the list
  - *later:* update the pantry

  Every change shows a preview first (the recipe, or what changed in it), and nothing is saved until you tap to confirm.
- **Conversations are saved,** so you can pick one up again.
- **Voice:** the phone or iPad keyboard's dictation works from day one. Hands-free voice may come later.

### 4. Meal planning

- **Tastes and rules** (Settings, for anyone in the household): foods someone doesn't eat or is allergic to, diets every meal must fit, how long weeknight dinners can take, how much to lean on Fry's sales, and notes for the assistant ("no fish on Mondays"). Fill the week, dinner ideas and the assistant follow them; a recipe that breaks one says so on its page (allergies in red). Mention one to the assistant in passing ("Jamie can't stand mushrooms") and it offers to remember it.
- A week view, one day at a time. Each household picks which meals it plans (breakfast, lunch, dinner, snacks; dinner by default) and whether weeks start on Sunday or Monday.
  - Each day is a full-width card with its meals side by side, and an empty meal is a "+ Add lunch" box in its place. On a phone the meals stack, and empty ones shrink to small "+ Lunch" buttons.
  - This week's days gone by fold into one line ("Sun – Tue · 3 cooked: …") until you open them.
  - Above the days: how many meals are planned, how many aren't on the list yet (tap to add them), and calories a day.
- **What's next**, big, at the top of this week (and on Today): the next meal still planned, with Start cooking, Mark cooked, Something else and Skip. It goes by the time of day: breakfast is "This morning" until 11, lunch "This afternoon" until 3 pm, dinner "Tonight". Cooking or skipping it, or its time going by, moves on to the next one, so with only dinners planned it's always "Tonight", and after tonight it's "Tomorrow night".
- Add a recipe to a meal, or a note instead ("leftovers", "eating out"). A recipe page has a Plan button too.
- **Fill the week** suggests recipes for the empty meals, from today on:
  - No repeats: nothing planned or made within two weeks, and a recipe and its versions ("Pancakes (dairy-free)") count as one dish.
  - Favors high ratings, recipes not tried yet, recipes tagged for the meal, and quick dinners on weeknights.
  - Leans on what's on sale at your Fry's, and says so ("Chicken thighs on sale"): meat and fish count most, produce less. **Lean on sales** in Tastes and rules is off, a little (the default, so favorites still come first) or a lot.
  - Breakfast, lunch and snacks only use recipes tagged for them. Dinner takes anything that isn't clearly another meal.
  - Re-roll any idea, or leave that meal empty, before adding them all.
- **Suggest something else** on any planned meal swaps in another recipe, with an undo.
- **Plan the week for me** (Settings → Meal plan, household admins): every week on a day and time you pick (Saturday at 9, say, in the household's own time), Mise fills the week ahead's empty meals the way Fill the week does, by your rules and tastes, and adds them to the shopping list (unless you'd rather do that yourself). Anything already planned is left alone. Today says "Mise planned Oct 18 – 24 for you" for a few days, with a link to look it over. A run missed while the server was off happens as soon as it's back; "Plan the week ahead now" runs it straight away.
- **With a sauce or side:** a planned meal can be made with something its recipe goes with ("Chicken + Rice with Peanut Sauce"), picked when planning from the recipe, from the meal's menu, or by Fill the week, which rotates through ones not had lately. The list, the pantry, cooking and the calories include both. Sauces and other parts of meals (anything paired with something, or tagged sauce, dressing, marinade and so on) aren't suggested as meals on their own.
- Mark each planned meal **cooked** (same as "I made this") or **skipped**.
- **The assistant** knows which week you're looking at. Ask it to fill the dinners or plan easy lunches, and it offers the meals as a card you add with one tap.
- **Food that needs using comes first:** Fill the week gives each item under "Use soon" in the pantry a recipe that uses it, as early in the week as one fits, and says so ("Uses up your spinach"). A skipped meal doesn't count toward no-repeats, so it can come straight back.
- *Later:* saved plan rules, and AI-ranked suggestions.

### 5. Shopping list

- **Add from the plan:** a week's planned meals (the ones not added yet) go on the list, scaled to their servings.
  - The same ingredient is combined across recipes ("1 onion" + "2 onions" → 3 onions), converting units when it's safe.
  - **What's in the pantry is subtracted:** 3 onions at home and 4 needed puts 1 on the list. Having some without a comparable amount ("half a bag" of rice) counts as enough. Food set aside for another upcoming meal doesn't count. You're told what was left off.
  - **Always on hand** items (salt, pepper, oil, water and so on; the household edits the list) are left off.
  - Each planned meal shows "On the list" once its ingredients are added.
- **Every week** items (Diet Pepsi, bananas) go on with each week's plan, or with one tap from the List page.
- Grouped by store section: produce, meat, dairy, bakery, canned goods and so on. Moving an item to another section is remembered for next time.
- Add anything by typing it ("2 lb ground beef", "paper towels").
- Check items off while shopping. They move to "In the cart", folded up at the bottom.
- **A card for each store's list** at the top: what's left, about what it costs, and the way to shop it (Send to the Fry's cart, Find each at Costco). Narrow what's showing to one meal's things, every-week items or what was typed in.
- **Badges and prices on each item:** the meals it's for, "Every week", and what it last cost at that list's store when Mise knows the product (from Send to Fry's or the Walmart extension). A "~" means the number of packages is a guess.
- **Put away** when you're home: everything in the cart goes into the pantry, remembering which meals it was bought for. Household things (paper towels) and always-on-hand items are just cleared.
- The assistant can offer items to add, as a card.
- The list goes to the store (see 7), and can be split into a list per store.
- **Lists by store.** Split the list in two or more (List → ⋯ → Split into lists by store): say Costco for meat and soda, and the main list for everything else. Each list can take whole aisles, and moving something to another list (tap it, then pick the list) teaches Mise that food goes there from now on. Tabs switch between lists, and each store's button sends only its list: Send to Fry's sends the Fry's list, Shop at Costco shows the Costco list.

### 6. Pantry

- **Grouped by aisle,** like the list. Type what you have ("2 lb chicken thighs", "rice"), or let it fill itself from Put away on the List.
- **Amounts can be rough:** "2 lb", "half a bag", or just "have it". The same food merges when the amounts add up.
- **Matching is forgiving but careful:** "boneless skinless chicken thighs" is "chicken thighs", but "cream cheese" isn't "cheese". There's no list of foods to set up or confirm.
- **Always on hand** items like salt, oil and flour are assumed to be there. Tap one on the Pantry page when it runs low, and it goes on the list.
  - Each covers its kinds: "salt" takes in kosher and sea salt, "pepper" takes in black pepper (not bell or white pepper), and "salt and pepper" in a recipe needs both. So the list holds one of each, and repeats fold together (Salt, Black Pepper, Pepper and Salt and Pepper become Salt and Pepper).
- **Cooked** meals take their ingredients out, scaled to the servings planned. Amounts that compare are subtracted; food bought for that meal without one is used up; "have it" staples stay. Marking the meal back to planned puts it all back.
- **Use soon** is at the top:
  - Fresh food gets a rough use-by date when it comes in (meat and fish 3 days, bread and deli 5, produce a week, nothing for onions, potatoes and other keepers). Edit or clear it any time.
  - Fresh food bought for a meal that was skipped, or went by uncooked, shows as "Bought for Tacos, which was skipped". Paprika bought for it doesn't.
- Mark something **used up** (with an undo), or send it back to the list.
- *Later:* barcode scanning, and the assistant updating the pantry.

### 7. Store connections

Our stores are Fry's, Costco and Walmart (see [roadmap.md](roadmap.md#milestone-6-store-connections-and-the-mise-extension)).

- **Fry's: straight into the cart** (List → **Send to Fry's**). Once a household admin picks the store and links the household's Fry's account in Settings → Stores:
  - Each item gets a product at that Fry's. The first time, Mise suggests one (the small AI model picks from Fry's search results, so "chicken thighs" isn't dog treats); after that it remembers. **Change** searches Fry's to pick another, and that's remembered too.
  - Recipe amounts become packages: 2 cups of milk is one gallon, 3 onions is 3 onions or one 3 lb bag, 2 cans is 2 cans, and an every-week "2 × 12-pack" is one 24-pack (or two 12-packs). When the amount and the package can't be compared (4 cloves of garlic, a bulb sold by the each), it says **Check how many**.
  - Fry's prices for that store today, sales (and when they end), stock and the aisle show on each line, with a total. A good price says what it usually costs.
  - **Add to Fry's cart** sends the ticked lines. Pick a pickup or delivery time and pay in the Fry's app or website. Kroger's API can only add, so what was sent is marked **Sent** and left out next time unless ticked.
  - Works the same for any Kroger store: Ralphs, King Soopers, Smith's, Harris Teeter and the rest.
- **Fry's sales, every morning:** with a Fry's store picked, Mise checks its prices each morning (or **Check now** in Settings → Stores). It refreshes every product it remembers and looks up the meat, fish and produce in your recipes. On the List, a sale item says **Sale · save $4.00**, and each store's card adds up what the sales save. Recipes has an **On sale** filter for recipes that use something on sale this week, and their cards say what. Fill the week, Today's ideas and the weekly autopilot lean on them.
- **Costco** (List → Shop → **Shop at Costco**): Costco has no way for apps to fill a cart, so the list for Costco links each item to its search at Costco Same-Day (run by Instacart; sign in there once with your membership). Check items off as they go in.
- **Shopping any store's site:** the extension keeps the list in the browser's side panel; check things off as they go in the cart, and **Find** searches Walmart, Costco Same-Day or Fry's for an item in the tab beside it.
- **Walmart: through the Mise browser extension** (its side panel → **Walmart cart**). Walmart doesn't let apps fill carts, so the extension works in your own signed-in Walmart tab:
  - **Find them on Walmart** searches Walmart for items without a product yet, a few seconds apart, and Mise picks the likeliest (its small AI model, passing over Walmart's ads). **Change** shows that item's results to pick another. On any Walmart product page, the extension's popup offers **Use this for…** an item on the list. Picks are remembered.
  - Packages, prices and a total, like Fry's. **Add to Walmart cart** opens each product's page in the Walmart tab and presses Walmart's own Add to cart (and + for more), about one every few seconds. If Walmart asks whether you're a person, it stops and says so; finish that check yourself and start it again.
  - It ends with what was added and what was skipped, and a link to your Walmart cart. Pick a pickup time and check out at Walmart.
- **Review first:** when the weekly autopilot plans the week, nothing goes into a cart by itself.
- **Mise never touches payment.**

### 8. Nutrition

- Per-serving numbers: calories, protein, carbs, fat, fiber, sugar and sodium.
- **Where the numbers come from, in order of preference:**
  1. The recipe site, when it publishes them.
  2. A calculation from the ingredients using USDA data (with a free USDA key in Settings). Lines it couldn't count are listed ("Not counted: 1 bay leaf").
  3. An AI estimate when there's no USDA key, or too much couldn't be counted. Always labeled as an estimate.
- **It happens by itself:** a new recipe, or one whose ingredients change, gets its nutrition worked out in the background. Changing only the servings rescales what's there. Each recipe also has a **Work out nutrition** button, and household admins can catch up the whole library (after a Mealie import, say) from Settings.
- **On the plan,** each day shows roughly what one person eats from that day's meals (one serving of each, skipped meals and notes left out), and the week shows the average.

### 9. Phone and iPad

- A mobile-first layout that also works well on iPad and desktop. It can be added to the home screen and runs like an app.
- **Today,** the home page:
  - **What's next,** big: the next meal planned, by the same time-of-day rule as the Plan (today's first, then the next day's once today's are done), with a solid "Tonight · Dinner" badge, its servings, time and "On the list" as chips, what's already home for it ("Already home: limes and garlic", from what was bought for it and put away), Start cooking, Mark cooked, and the rest of today's meals underneath.
  - **An idea for tonight** when dinner isn't planned (before 9 pm): one at a time, from your recipes (using up what needs using first, and saying so) or new on the sites you follow, with Both / Your recipes / Your sites to choose. **Plan it for tonight**, or for a site recipe **Import and plan for tonight** in one tap; **Another idea** takes turns between the two.
  - Three tiles: this week (meals planned, and the first open dinner), shopping (how many to buy, about what it costs, the first few), and what to use soon.
  - **The rest of the week** (or the next three days near the end of it): a card a day with its dinner and anything else ("and Leftovers for lunch").
  - The sites spotlight (see Recipes), favorites not made in three weeks, and what was added lately.
  - A new household gets three steps to start instead.
- **The cook view:**
  - **Get ready** first: everything to gather, as a checklist, then one step at a time.
  - Each step shows the ingredients it uses, with amounts (tap one once it's in).
  - Large text, with a size setting (up to extra large) remembered on each device.
  - Scaled quantities, as written or in grams.
  - The screen stays on.
  - **Timers:** times in steps become tap-to-start timers ("bake 25 minutes"), and any other length is a tap away. They beep and buzz when done, take "+1 min", keep running while you look at something else in the app (shown in the top bar, a tap away from the cooking), and survive a reload.
  - **Leaving doesn't lose your place:** coming back within 12 hours picks up at the same step, with what was ticked off.
  - Started from the plan or Today, **Done cooking** marks that meal cooked (and takes its ingredients out of the pantry), then goes back where you started.
- **Hands-free** (the microphone button in the cook view, in Chrome, Edge and Safari): each page is read aloud as it comes up, and it listens for "next", "back", "read it", "ingredients", "timer for 10 minutes", "start the timer", "how much garlic?", "stop" and "done". Only whole commands count, so kitchen conversation ("what's next for dinner?") doesn't turn the page. It stops listening while it speaks. The browser turns speech into text (Chrome uses Google's servers for this).
  - It reads in the best voice the device has (Microsoft's "Natural" voices in Edge, Apple's "Premium" and "Enhanced" ones, then Google's), never the robotic default. The text menu has **Voice**: "Best on this device" or any good voice for the language, with **Test voice**, remembered on each device.
  - **Or the server's voice**, the same on every device and close to a person: Kokoro, which runs beside Mise for free (the default when the compose file runs it), or OpenAI's (about 2 to 5¢ to read a recipe once). Settings → This server → Voice picks it. Each voice has a play button that reads a sample step in it before it's picked (made once and kept; for OpenAI a fraction of a cent the first time), and Kokoro lists its English voices with their accent and whether it's a woman or a man, the rest under "Voices in other languages". Each step's audio is made once and saved; the next step is made while the current one is read; and if the server voice fails or takes too long, the device's voice reads instead.
- **Built for messy hands:** big tap targets, and swipe between steps.
- Reading recipes offline may come later.

### 10. Access

- Login is required: one account per person, in one household.
- **Joining:** a household admin sends an invite link (single use, a week long), and the person makes their own account. Admins can also add someone directly with a username and password.
- **Sign-up** is off by default. When the server admin turns it on, anyone who reaches Mise can create an account, which starts a new household.
- **Household admins** invite, remove and reset people, rename the household and manage tidying up.
- **The server admin** (whoever set Mise up) also manages the AI keys and models, sign-up, the list of households and the Mealie import. All households use the server's AI keys, and Settings shows each one's spending.
- **Appearance is personal:** light, dark or follow the device, plus a choice of three palettes (Sage & Cream by default, Paprika & Linen, Cast Iron & Saffron). For now it's saved on each device. Once accounts exist it follows the person.
- Reachable on the home network and from anywhere through a public URL.

## Out of scope for now

- Sharing recipes between households
- Belonging to more than one household
- Automatic checkout or payment
- Native iOS or Android apps (the home-screen web app covers this)
- Social features

## What we borrow from Mealie

Mealie is AGPL, so we reuse its ideas and behavior, not its code. Features worth matching:

- Importing from a URL by reading the recipe data sites embed (the schema.org Recipe format)
- Recipe scaling
- Meal plan suggestions (by tag or rating) and re-rolling a single day
- "I made this" and the last-made date
- Foods and units as shared lists, so the same ingredient adds up across recipes
- Shopping list sections by store aisle (Mealie calls them labels)
- On-hand foods (we go further and track amounts)
- Cook mode
