# Product

## Why build this

Today we use Mealie. It handles recipes, plans and lists well, but it falls short where it matters most to us:

- **AI isn't part of how we cook in it.** The real workflow is chatting with ChatGPT for ideas and substitutions, then copying the results over by hand.
- **The pantry is a yes/no flag.** It doesn't know amounts, and it doesn't know about food bought for a meal that got skipped.
- **There's no way to send a list to a store.**
- **Nutrition is typed in by hand.**

Mise puts an AI assistant at the center and builds planning, pantry and shopping around it.

## Who uses it

- **One household.** Everyone shares one recipe library, plan, pantry and list.
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
- "I made this" records when a recipe was cooked. This feeds the planner and the pantry.
- Search by name, tag or ingredient.

### 2. Adding recipes

| Way in | How it works |
|---|---|
| Link | Paste a URL. We read the structured recipe data most sites embed, and use AI when a site doesn't have it. Importing the same link twice offers the existing recipe instead. |
| Video | Paste a TikTok, YouTube or Instagram link. We read the caption, the spoken words and, for short videos, frames from the video, and AI writes up the recipe. |
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
- fill in missing servings or times, marked as estimates

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
  - update the pantry

  Every change shows a preview first (the recipe, or what changed in it), and nothing is saved until you tap to confirm.
- **Conversations are saved,** so you can pick one up again.
- **Voice:** the phone or iPad keyboard's dictation works from day one. Hands-free voice may come later.

### 4. Meal planning

- A week view. Dinners by default, with breakfast, lunch and snacks optional.
- Add a recipe to a day, or add a note instead ("leftovers", "eating out").
- **Suggest the week:**
  - Rules, such as "quick recipes on weeknights," "no repeats within 14 days," or "favor high ratings."
  - An AI mode that also weighs the pantry, food that needs using soon, skipped meals and what we like.
- Re-roll one day's suggestion without touching the rest.
- Mark each planned meal **cooked** (same as "I made this") or **skipped**.

### 5. Shopping list

- **Generated from the week's plan:**
  - The same ingredient is combined across recipes ("1 onion" + "2 onions" → 3 onions).
  - Units are converted when it's safe.
  - Anything in the pantry is subtracted.
- Grouped by store section: produce, dairy, meat, pantry and so on.
- Add manual items ("paper towels").
- Check items off while shopping. Checked items move into the pantry.
- Send the list to the store (see 7).
- One main list to start. More lists can come later if needed.

### 6. Pantry

- **Amounts can be rough:** "2 lb", "half a bag", or just "have it".
- **Staples** like salt, oil and flour are assumed to be on hand. They only go on the list when marked low or out.
- **Bought** items flow in from the shopping list.
- **Cooked** meals take their ingredients out. It's approximate, and easy to correct.
- **Skipped meals:** food bought for a planned meal that wasn't cooked stays in the pantry, tagged with the meal it was bought for. Next week's suggestions try to use it.
- **Use-by dates** are optional for perishables. A "use soon" list surfaces them.
- Barcode scanning may come later.

### 7. Grocery ordering (Walmart pickup)

- **Map each ingredient to the Walmart product we usually buy, once.** Mise remembers the mapping.
- **Turn recipe amounts into things you can buy.** "3 cloves garlic + 1 tbsp minced garlic" becomes one bulb. AI helps with this.
- **A browser extension fills the Walmart cart** while you're logged in. You pick the pickup time and check out yourself. Mise never touches payment.
- **Fallback:** a list of product links.

### 8. Nutrition

- Per-serving numbers: calories, protein, carbs, fat, fiber, sugar and sodium.
- **Where the numbers come from, in order of preference:**
  1. The recipe site, when it publishes them.
  2. A calculation from the ingredients using USDA data.
  3. An AI estimate as a last resort, clearly labeled as an estimate.
- Shown on each recipe. Daily and weekly totals for the plan come later.

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

- Login is required, and everyone in the household shares the same data. Whether that's one account per person or one shared login is [open question 2](roadmap.md#open-questions).
- An admin manages household members and the AI settings (API keys and models).
- **Appearance is personal:** light, dark or follow the device, plus a choice of three palettes (Sage & Cream by default, Paprika & Linen, Cast Iron & Saffron). For now it's saved on each device. Once accounts exist it follows the person.
- Reachable on the home network and from anywhere through a public URL.

## Out of scope for now

- Hosting for other households, or sharing with them
- Automatic checkout or payment
- Native iOS or Android apps (the home-screen web app covers this)
- Social features

## What we borrow from Mealie

Mealie is AGPL, so we reuse its ideas and behavior, not its code. Features worth matching:

- Importing from a URL by reading the recipe data sites embed (the schema.org Recipe format)
- Recipe scaling
- Meal plan rules (by tag, category or rating) and re-rolling a single day
- "I made this" and the last-made date
- Foods and units as shared lists, so the same ingredient adds up across recipes
- Shopping list sections by store aisle (Mealie calls them labels)
- On-hand foods (we go further and track amounts)
- Cook mode
