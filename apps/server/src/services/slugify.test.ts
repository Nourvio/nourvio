import { expect, test } from "vitest"

import { slugify } from "./recipes.ts"

test.each([
  ["BA’s Best Chocolate Chip Cookies", "bas-best-chocolate-chip-cookies"],
  ["Mom's Mac & Cheese", "moms-mac-and-cheese"],
  ["Crème Brûlée", "creme-brulee"],
  ["!!!", "recipe"],
])("%s → %s", (name, slug) => {
  expect(slugify(name)).toBe(slug)
})
