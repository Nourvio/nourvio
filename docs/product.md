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
- Search by name, tag or ingredient.

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

- A week view, one day at a time. Each household picks which meals it plans (breakfast, lunch, dinner, snacks; dinner by default) and whether weeks start on Sunday or Monday. Empty meals shrink to small "+ Lunch" buttons, so a sparse week stays tidy.
- Add a recipe to a meal, or a note instead ("leftovers", "eating out"). A recipe page has a Plan button too.
- **Fill the week** suggests recipes for the empty meals, from today on:
  - No repeats: nothing planned or made within two weeks, and a recipe and its versions ("Pancakes (dairy-free)") count as one dish.
  - Favors high ratings, recipes not tried yet, recipes tagged for the meal, and quick dinners on weeknights.
  - Breakfast, lunch and snacks only use recipes tagged for them. Dinner takes anything that isn't clearly another meal.
  - Re-roll any idea, or leave that meal empty, before adding them all.
- **Suggest something else** on any planned meal swaps in another recipe, with an undo.
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
- Check items off while shopping. They move to "In the cart".
- **Put away** when you're home: everything in the cart goes into the pantry, remembering which meals it was bought for. Household things (paper towels) and always-on-hand items are just cleared.
- The assistant can offer items to add, as a card.
- *Later:* the list goes to the store (see 7).
- One list per household. More lists can come later if needed.

### 6. Pantry

- **Grouped by aisle,** like the list. Type what you have ("2 lb chicken thighs", "rice"), or let it fill itself from Put away on the List.
- **Amounts can be rough:** "2 lb", "half a bag", or just "have it". The same food merges when the amounts add up.
- **Matching is forgiving but careful:** "boneless skinless chicken thighs" is "chicken thighs", but "cream cheese" isn't "cheese". There's no list of foods to set up or confirm.
- **Always on hand** items like salt, oil and flour are assumed to be there. Tap one on the Pantry page when it runs low, and it goes on the list.
- **Cooked** meals take their ingredients out, scaled to the servings planned. Amounts that compare are subtracted; food bought for that meal without one is used up; "have it" staples stay. Marking the meal back to planned puts it all back.
- **Use soon** is at the top:
  - Fresh food gets a rough use-by date when it comes in (meat and fish 3 days, bread and deli 5, produce a week, nothing for onions, potatoes and other keepers). Edit or clear it any time.
  - Fresh food bought for a meal that was skipped, or went by uncooked, shows as "Bought for Tacos, which was skipped". Paprika bought for it doesn't.
- Mark something **used up** (with an undo), or send it back to the list.
- *Later:* barcode scanning, and the assistant updating the pantry.

### 7. Grocery ordering (Walmart pickup)

- **Map each ingredient to the Walmart product we usually buy, once.** Mise remembers the mapping.
- **Turn recipe amounts into things you can buy.** "3 cloves garlic + 1 tbsp minced garlic" becomes one bulb. AI helps with this.
- **A browser extension fills the Walmart cart** while you're logged in. You pick the pickup time and check out yourself. Mise never touches payment.
- **Fallback:** a list of product links.

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
- **The cook view:**
  - large text
  - one step at a time or the full list
  - an ingredient checklist
  - scaled quantities
  - the screen stays on
  - times in steps become tap-to-start timers ("bake 25 minutes")
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
