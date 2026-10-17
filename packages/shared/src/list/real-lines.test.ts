import { expect, test } from "vitest"
import { combineLines } from "./amounts.ts"
import { parseIngredient } from "../ingredients/parse.ts"
import { lineFood } from "./food.ts"

// Lines as recipe sites write them, from a household's own recipes: what
// goes on the list for each.

test.each([
  ["3/4 cup green onions (, finely sliced)", "green onions", "green onion"],
  ["400g / 14oz can chickpeas (, drained)", "chickpeas", "chickpea"],
  ["zest of half of a lemon", "lemon", "lemon"],
  [
    "1/2 tsp. Diamond Crystal or 1/4 tsp. Morton kosher salt, plus more",
    "salt",
    "salt",
  ],
  [
    "1/2 medium yellow or white onion, diced ((1/2 medium onion yields ~1 heaping cup or 150 g))",
    "yellow onion",
    "onion",
  ],
  ["1 medium yellow onion (chopped)", "yellow onion", "onion"],
  ["450g carrots peeled and chopped", "carrots", "carrot"],
  ["1 onion chopped", "onion", "onion"],
  ["2 large eggs and 2 large yolks, room temperature", "large eggs", "egg"],
  [
    "handful coriander (about 1/2 a supermarket packet)",
    "coriander",
    "coriander",
  ],
  [
    "1/3 cup Chardonnay or other dry white wine (, substitute chicken stock/broth (Note 5))",
    "Chardonnay",
    "white wine",
  ],
  [
    "2 tbsp Chinese cooking wine (or Taiwanese rice wine (mijiu) if you can find it, or chicken stock/broth (Note 5))",
    "Chinese cooking wine",
    "shaoxing wine",
  ],
  [
    "3/4 cup thickened cream / heavy cream (, or any full fat cream ~35% fat)",
    "thickened cream",
    "heavy cream",
  ],
  ["a small handful of coriander leaves", "coriander leaves", "cilantro"],
  [
    "Coriander leaves (cilantro) (, roughly chopped, recommended)",
    "Coriander leaves",
    "cilantro",
  ],
  ["A lot of garlic (to taste)", "garlic", "garlic"],
  ["1/2 small clove garlic ((or 1/8 tsp garlic powder))", "garlic", "garlic"],
  [
    "3 tbsp oyster sauce ((can substitute with vegetarian oyster sauce))",
    "oyster sauce",
    "oyster sauce",
  ],
  [
    "2 jalapeños (diced, more for topping, if desired)",
    "jalapeños",
    "jalapeño",
  ],
  ["Naan (, optional)", "Naan", "naan"],
  ["1 cup frozen corn* ((or canned, drained))", "frozen corn", "frozen corn"],
  ["2 cups chicken stock/broth (low sodium)", "chicken stock", "chicken stock"],
  ["1 (6 oz) tube can of tomato paste", "tomato paste", "tomato paste"],
  [
    "1 lb beef mince (ground beef) (OR half pork, half beef)",
    "beef mince",
    "ground beef",
  ],
])("%s", (line, name, key) => {
  expect(lineFood(line)).toEqual({ name, key })
})

test("rough amounts, 'and' fractions, and amounts added or taken off", () => {
  expect(parseIngredient("1 and 1/2 cups milk")).toMatchObject({
    quantity: 1.5,
    unitId: "cup",
    food: "milk",
  })
  const heaping = parseIngredient("Heaping ½ teaspoon ground cumin")
  expect(heaping).toMatchObject({ quantity: 0.5, unitId: "teaspoon" })
  expect(
    heaping.parts &&
      heaping.parts.quantity +
        heaping.parts.between +
        heaping.parts.unit +
        heaping.parts.rest
  ).toBe(heaping.text)
  expect(lineFood("About 3 quarts peanut or vegetable oil")).toEqual({
    name: "peanut oil",
    key: "peanut oil",
  })
  expect(lineFood("2 cups minus 2 tablespoons cake flour")?.key).toBe(
    "cake flour"
  )
  expect(lineFood("1/3 cup + 2 tbsp white sugar")?.key).toBe("sugar")
})

test("names a list kept before they were tidied as the food", () => {
  expect(lineFood("cloves garlic")).toEqual({ name: "garlic", key: "garlic" })
  expect(lineFood("garlic cloves (")).toEqual({
    name: "garlic cloves",
    key: "garlic",
  })
  expect(lineFood("can chickpeas (")?.name).toBe("chickpeas")
  expect(lineFood("corn tortillas*")?.name).toBe("corn tortillas")
})

test("garlic however it's measured is one line, in cloves", () => {
  const [garlic, ...rest] = combineLines([
    { text: "2 large cloves garlic, minced", factor: 1, source: "A" },
    { text: "3 garlic cloves (finely chopped)", factor: 1, source: "B" },
    { text: "1 tbsp garlic (minced)", factor: 1, source: "C" },
  ])
  expect(rest).toEqual([])
  expect(garlic).toMatchObject({ name: "garlic", quantity: 8, unit: "clove" })
})
