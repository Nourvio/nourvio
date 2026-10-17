# Foods

A plan for one shared vocabulary of foods: what each one is called (in every language Merran speaks, and the ways recipes and regions say it), what it belongs to, and what Merran knows about it. Recipes, the list, the pantry, nutrition and the stores all ask it the same question: which food is this line about?

Status: planned (October 17, 2026). It comes after the stores' costs and budget and before the Walmart cart, which searches by the same names. See [scope.md](scope.md).

## Why

Today Merran knows about food through about fifteen word lists spread over the shared package, each kept by hand:

| Where | What it knows |
|---|---|
| `list/synonyms.ts` | Plain flour is all-purpose flour, a lemon wedge is a lemon |
| `list/food.ts` | Prep and size words, what's sold that way, choices, containers |
| `list/aisles.ts` | Which aisle a food is in, by pattern |
| `list/amounts.ts` | A food's own units: a head of garlic is ten cloves |
| `list/costs.ts` | What one of something sold by weight weighs |
| `units/weights.ts` | Baking staples' grams per cup |
| `pantry/pantry.ts` | Words that don't make it a different thing to have; what keeps out of the fridge; what keeps for weeks |
| `list/on-hand.ts` | What's always at home |
| `nutrition/grams.ts` | Portion volumes, tiny amounts |
| `ingredients/parse.ts` | Measures without a number, sizes before a unit |
| `plan/tastes.ts`, `plan/themes.ts`, `diets/diets.ts` | Which foods break a diet, which are fish |
| Server: `food_matches` | The USDA food for each food, and what a unit of it weighs, learned |

Trying the list with a household's real recipes showed what that costs:

- **Every fix touches two or three lists.** Teaching it that a garlic clove is garlic meant a synonym, a food unit, a measure word and a test.
- **Rules strip words; they can't find the food.** "King Arthur Unbleached All-Purpose Flour" stays as written, because nothing says which words are the food. "Diamond Crystal" (a salt) can't become kosher salt at all.
- **It's English only,** though [platform.md](platform.md) promises parsing for other languages "added as data, not code".
- **There's no "kind of".** A recipe's "bell pepper" can't be met by the green bell pepper in the pantry, because one key can't say one is a kind of the other.

## What it isn't

Looked at and decided against, with the reasons, so it isn't proposed again without new ones:

- **Not an import of FoodOn or USDA FoodData Central.** FoodOn is a food-science ontology of over 100,000 terms ("Allium sativum bulb"); FoodData Central names read "Chicken, broilers or fryers, thigh, meat only, raw". Neither knows "capsicum", "coriander leaves" or "can chickpeas", which is the part that matters, so curating them down would be most of the work and still miss it. FoodData Central ids are kept on foods where they help nutrition (they're public domain).
- **Not Open Food Facts' taxonomy either,** though it's closer to how cooks write and has many languages: it's under the ODbL, whose share-alike applies to a database built from it, which doesn't sit well inside an AGPL app's own data. Merran's vocabulary is written for Merran, under its own license.
- **Not thousands of entries.** Recipe ingredients are lopsided: a few hundred foods make up most lines. A small vocabulary that's right beats a big one nobody checks. It grows from lines that don't match, not from a catalog.
- **No numeric ids.** A food's key ("all-purpose flour") is its identity, as now. Foods outside the vocabulary are always there (gochugaru, mijiu, a grandmother's spice mix), and they need keys from their text anyway; one kind of key keeps it one system. `FOOD_KEYS_VERSION` and the `foods.rekey` job already move stored keys when the vocabulary changes.
- **No store product ids.** They differ by store, region and week; they're a household's (`store_products`), not the vocabulary's.
- **No AI learning that changes matching by itself.** A wrong mapping learned once spreads everywhere (a search for tomatoes found a lipstick). AI suggests; a person accepts, for their household. And Merran never calls home, so nothing learned on one server reaches another.
- **Diets aren't moved into it.** Allergy and diet labels stay with their own word lists ([diets.ts](../packages/shared/src/diets/diets.ts)), which look at the whole line on purpose. The vocabulary can add what it knows about a food (pesto has nuts), but it can never take a flag away.

## A food

Foods live in the shared package, as data with the code that reads them: `packages/shared/src/foods/data/<language>.json` for names, and `packages/shared/src/foods/data/foods.json` for what's true of a food in every language. They're read once when the package loads (a few hundred entries is nothing to hold in memory), and they ship with releases, like the starter collections.

```jsonc
// foods.json
{
  "all-purpose flour": {
    "parent": "flour",
    "aisle": "pantry",
    "gramsPerCup": 120,
    "sold": "weight"
  },
  "garlic": {
    "aisle": "produce",
    "units": { "head": { "clove": 10 }, "each": { "clove": 1 }, "tablespoon": { "clove": 3 } },
    "shows": { "unit": "head", "whole": true },
    "keeps": "out"
  },
  "egg": {
    "aisle": "dairy-eggs",
    "keepSize": true,
    "gramsEach": 50,
    "sold": "count"
  },
  "whole chicken": { "parent": "chicken", "aisle": "meat-seafood", "gramsEach": 2000, "sold": "weight" }
}
```

```jsonc
// en.json: the names a food goes by, the first the one Merran shows
{
  "all-purpose flour": ["all-purpose flour", "plain flour", "AP flour", "all purpose flour"],
  "cilantro": ["cilantro", "coriander leaves", "fresh coriander"],
  "garlic": ["garlic", "garlic clove", "clove of garlic"],
  "kosher salt": ["kosher salt", "coarse salt"]
}
```

```jsonc
// brands/en.json: dropped before looking, or naming a food
{
  "drop": ["King Arthur", "Bob's Red Mill", "Simple Truth", "Private Selection"],
  "means": { "Diamond Crystal": "kosher salt", "Morton kosher salt": "kosher salt" }
}
```

What a food can say, each optional except its key:

| Field | What it's for | Replaces |
|---|---|---|
| key | Its identity, in English, lowercase, singular | |
| names (per language) | What it's called; the first is shown | `synonyms.ts`, the pantry's same-thing words |
| parent | What it's a kind of: green bell pepper → bell pepper | |
| aisle | Where it's shelved | `AISLE_WORDS` (kept for foods outside the vocabulary) |
| gramsPerCup | Its density, so cups and grams add up | `GRAMS_PER_CUP` |
| gramsEach | What one weighs, so "2 onions" can be priced by the pound | `EACH_GRAMS` |
| units | Its own units: a head of garlic, a stick of butter | `FOOD_UNITS` |
| keepSize | A size that's a different thing to buy: large eggs, jumbo shrimp | the size rules' exceptions |
| sold | By weight, by count, or by the pack | the cost rules' guesses |
| keeps | Out of the fridge, or for weeks | `KEEPS_OUT`, `LONG_KEEPING` |
| onHand | Usually at home | `DEFAULT_ON_HAND` |
| product | A name that's a product of its own: crushed red pepper, Better Than Bouillon | `PRODUCT` |
| search | What to search a store for, when the name isn't it | the search's word swaps |
| fdc | Its USDA FoodData Central food | seeds `food_matches` |

Brands get a list of their own, per language: words to drop ("King Arthur", "Bob's Red Mill", "Simple Truth") and brands that name a food ("Diamond Crystal" is kosher salt, "Sriracha" is sriracha). A brand that's the product, with no food under it, is a food with `product`.

## Finding the food in a line

The parser stays as it is: amount, unit, what's in brackets, notes after a comma. The vocabulary changes what happens to the words left:

1. **Tidy:** what's in brackets, how it's used ("to serve"), a measure without a number, what it comes in ("can"), a second choice, as `shoppingName` does now.
2. **Find:** the longest known name inside what's left, on word boundaries, plurals included, brands dropped first. "King Arthur Unbleached All-Purpose Flour" has "all-purpose flour" in it; "finely chopped fresh flat-leaf parsley" has "parsley". Around the name, words for prep ("chopped") and size ("large", unless the food keeps it) are noted, not lost.
3. **Otherwise:** the tidied text, as today, and its plain form as the key. These are the lines the coverage report lists.

What comes out of a line:

```ts
type FoodFound = {
  key: string           // "all-purpose flour", or the plain text's key
  name: string          // what the list shows: the food's name, or the text
  known: boolean        // found in the vocabulary
  prep: string | null   // "finely chopped"
  size: string | null   // "large"
}
```

`foodKey`, `lineFood` and `shoppingName` keep their signatures and use it, so callers don't change.

## Kinds of

A parent is for matching what's at home and what's needed, never for joining lines on the list:

- **The list keeps kinds apart:** red and green bell peppers are two lines, and their own products at the store.
- **The pantry can cover a parent with a kind:** a recipe's "bell pepper" uses the green bell pepper at home, and "uses up" counts it. Not the other way: a recipe's green bell pepper isn't met by a red one.
- **Prices and costs use the food's own product,** then its parent's when it has none.

## A household's own

Each household can teach it, as it does aisles now (`food_placements`):

- **"Same as…"** on a list line: these unsalted butter sticks are butter, for this household. Kept by key, in a `food_aliases` table.
- **"Not the same":** two lines it joined that the household wants apart.

These win over the vocabulary, for that household only.

## Where AI helps

Only where a person sees what it did:

- **At import and in the tidy-up,** a line the vocabulary doesn't know can get a suggested food, shown on the Review page with the other suggestions. Accepted, it's kept on the recipe line.
- **Never while making the list or a cost.** Those are deterministic: the same lines give the same list on every server.

Recipe lines keep the food they were matched to (`recipe_ingredients.food_key`, and whether it came from the vocabulary, a person or AI), so the list doesn't re-parse every line each time, and the re-key job updates them with the rest.

## Knowing it works

- **A corpus of lines,** `packages/shared/src/foods/corpus/en.txt`: a thousand or so ingredient lines in the styles sites write them (WP Recipe Maker's "(, drained)", RecipeTin's "((Note 4))", British and Australian names, brands, ranges, choices), written for the project rather than copied. Each one has its expected food in a golden file the tests check.
- **A coverage target:** the share of corpus lines matched to a known food, checked in CI so it can't quietly drop. 95% to start.
- **A report for a real library:** `pnpm --filter @merran/server foods:coverage` runs a server's own recipes through it and lists the foods it didn't know, most common first. It reads the database and prints; it's for growing the vocabulary, and nothing it reads is committed.
- **Adding a food is one entry and one corpus line,** described in the contributing guide.

## Slices

Each slice ends with the tests passing and `FOOD_KEYS_VERSION` bumped, so what's stored follows.

1. **The vocabulary and finding foods.** The data files and their loader; brands; the matcher; `foodKey`, `lineFood` and `shoppingName` using it, with today's lists as the fallback for unknown foods; the first few hundred foods, from the corpus and the dev households' recipes; the corpus, golden file and coverage check.
   *Done when:* the corpus is 95% matched, and a week of the dev household's recipes added from the plan has no line named by a brand, a bracket or a measure.
2. **One place for what Merran knows about food.** Densities, weights each, food units, aisles, keeping, always-on-hand and store search words read from the vocabulary; `food_matches` starts from its USDA ids; the old lists are deleted, except the aisle patterns for foods it doesn't know.
   *Done when:* `synonyms.ts`, `GRAMS_PER_CUP`, `EACH_GRAMS`, `FOOD_UNITS`, `KEEPS_OUT`, `LONG_KEEPING` and the pantry's same-thing words are gone, and nothing else changed in the tests' results.
3. **Kinds of.** Parents in the pantry, "uses up" and costs.
   *Done when:* a recipe's bell pepper is covered by the pantry's green bell pepper, and the list still has red and green apart.
4. **A household's own, and AI's suggestions.** `food_aliases` with "Same as…" and "Not the same" on the list; `recipe_ingredients.food_key`; suggested foods for unknown lines in the tidy-up.
   *Done when:* a household marks a line the same as another and the next list joins them, and a line no one knew gets a food from the Review page.

Other languages come after 0.1 with translations: a language is its names file, its brands, its words for measures and how-much, and its corpus.

## Risks

- **Joining what shouldn't be:** coriander seed and coriander leaf, bread and all-purpose flour, light and dark brown sugar. Keys stay specific, kinds go in `parent`, and the corpus has the pairs that must stay apart.
- **The vocabulary going stale:** it grows only from lines that don't match, with a corpus line for each food, so every entry has a reason and a test.
- **Allergies:** the diet word lists keep the final say ([diets.ts](../packages/shared/src/diets/diets.ts)); the vocabulary can only add to what they find.
- **Speed:** a few hundred foods' names go into one lookup at load; finding a food is a few map lookups per line.
