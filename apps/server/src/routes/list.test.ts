import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

type Item = {
  id: string
  name: string
  amount: string
  sectionId: string
  checked: boolean
  source: string
  recipes: string[]
}

describe("shopping list", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const list = async () => (await t.admin.get("/api/list")).body.items as Item[]
  const find = (items: Item[], name: string) =>
    items.find((i) => i.name.toLowerCase() === name.toLowerCase())

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const chili = (
      await t.admin.post("/api/recipes", {
        name: "Chili",
        servings: 4,
        ingredients: [
          "1 lb ground beef",
          "1 onion, diced",
          "2 cloves garlic",
          "1 (15 oz) can kidney beans",
          "Salt and pepper to taste",
        ],
      })
    ).body.recipe
    const soup = (
      await t.admin.post("/api/recipes", {
        name: "Soup",
        servings: 2,
        ingredients: [
          "2 onions",
          "1 tbsp butter",
          "2 cups chicken stock",
          "salt",
        ],
      })
    ).body.recipe
    // Chili at its own 4 servings; soup doubled to 4.
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-14",
      meal: "dinner",
      recipeId: chili.id,
    })
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-15",
      meal: "lunch",
      recipeId: soup.id,
      servings: 4,
    })
    // Skipped meals and other weeks don't count.
    const skipped = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-10-16",
        meal: "dinner",
        recipeId: soup.id,
      })
    ).body.entry
    await t.admin.patch(`/api/plan/entries/${skipped.id}`, {
      status: "skipped",
    })
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-25",
      meal: "dinner",
      recipeId: chili.id,
    })
  })
  afterAll(() => t.close())

  test("every-week items come along with the plan", async () => {
    const res = await t.admin.post("/api/list/weekly", {
      name: "Diet Pepsi",
      amount: "2 × 12-pack",
    })
    expect(res.status).toBe(201)
    expect(res.body.item).toMatchObject({
      name: "Diet Pepsi",
      sectionId: "beverages",
    })
  })

  test("adds the week's planned meals, combined and scaled", async () => {
    const res = await t.admin.post("/api/list/from-plan", {
      from: "2026-10-11",
      to: "2026-10-17",
    })
    expect(res.body).toMatchObject({ meals: 2, merged: 0, weekly: 1 })
    expect(res.body.onHand.map((n: string) => n.toLowerCase()).sort()).toEqual([
      "salt",
      "salt and pepper",
    ])

    const items = await list()
    expect(find(items, "onion")).toMatchObject({
      amount: "5", // 1 for the chili, 2 × 2 for the doubled soup
      sectionId: "produce",
      recipes: ["Chili", "Soup"],
    })
    expect(find(items, "ground beef")).toMatchObject({
      amount: "1 lb",
      sectionId: "meat-seafood",
    })
    expect(find(items, "kidney beans")).toMatchObject({
      amount: "1 can",
      sectionId: "canned-jarred",
    })
    expect(find(items, "chicken stock")).toMatchObject({ amount: "4 c" })
    expect(find(items, "Diet Pepsi")).toMatchObject({
      amount: "2 × 12-pack",
      source: "weekly",
    })
    expect(find(items, "salt")).toBeUndefined()

    // In store order: produce before meat before dairy...
    const sections = items.map((i) => i.sectionId)
    expect(sections.indexOf("produce")).toBeLessThan(
      sections.indexOf("meat-seafood")
    )

    // Meals on the list are marked as such.
    const plan = (await t.admin.get("/api/plan?from=2026-10-14&to=2026-10-14"))
      .body.entries
    expect(plan[0].listed).toBe(true)
  })

  test("adding again only brings new meals", async () => {
    const again = await t.admin.post("/api/list/from-plan", {
      from: "2026-10-11",
      to: "2026-10-17",
    })
    expect(again.body).toMatchObject({ meals: 0, added: 0, weekly: 0 })

    // A new meal merges into what's there.
    const recipe = (
      await t.admin.post("/api/recipes", {
        name: "Salsa",
        ingredients: ["1 onion", "3 tomatoes"],
      })
    ).body.recipe
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-17",
      meal: "snack",
      recipeId: recipe.id,
    })
    const res = await t.admin.post("/api/list/from-plan", {
      from: "2026-10-11",
      to: "2026-10-17",
    })
    expect(res.body).toMatchObject({ meals: 1, added: 1, merged: 1 })
    expect(find(await list(), "onion")).toMatchObject({
      amount: "6",
      recipes: ["Chili", "Soup", "Salsa"],
    })
  })

  test("takes typed items, with or without an amount", async () => {
    const towels = await t.admin.post("/api/list/items", {
      text: "paper towels",
    })
    expect(towels.body.item).toMatchObject({
      name: "paper towels",
      amount: "",
      sectionId: "household",
      source: "manual",
    })
    const cheese = await t.admin.post("/api/list/items", {
      text: "8 oz cheddar",
    })
    expect(cheese.body.item).toMatchObject({
      name: "cheddar",
      amount: "8 oz",
      sectionId: "dairy-eggs",
    })
  })

  test("checks off, edits and clears items", async () => {
    const onion = find(await list(), "onion")!
    const checked = await t.admin.patch(`/api/list/items/${onion.id}`, {
      checked: true,
    })
    expect(checked.body.item.checked).toBe(true)

    const beef = find(await list(), "ground beef")!
    const edited = await t.admin.patch(`/api/list/items/${beef.id}`, {
      amount: "2 lb",
    })
    expect(edited.body.item.amount).toBe("2 lb")
    const free = await t.admin.patch(`/api/list/items/${beef.id}`, {
      amount: "family pack",
    })
    expect(free.body.item.amount).toBe("family pack")

    const cleared = await t.admin.post("/api/list/clear-checked")
    expect(cleared.body.removed).toBe(1)
    expect(find(await list(), "onion")).toBeUndefined()
  })

  test("remembers where things go", async () => {
    const towels = find(await list(), "paper towels")!
    await t.admin.patch(`/api/list/items/${towels.id}`, { sectionId: "other" })
    const again = await t.admin.post("/api/list/items", { text: "Paper Towel" })
    expect(again.body.item.sectionId).toBe("other")
  })

  test("leaves out what's always on hand", async () => {
    await t.admin.patch("/api/household", {
      onHand: ["salt", "butter", "Butter"],
    })
    expect((await t.admin.get("/api/household")).body.household.onHand).toEqual(
      ["salt", "butter"]
    )
    const recipe = (
      await t.admin.post("/api/recipes", {
        name: "Toast",
        ingredients: ["2 slices bread", "1 tbsp butter"],
      })
    ).body.recipe
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-12",
      meal: "breakfast",
      recipeId: recipe.id,
    })
    const res = await t.admin.post("/api/list/from-plan", {
      from: "2026-10-12",
      to: "2026-10-12",
    })
    expect(res.body.onHand).toEqual(["butter"])
    expect(find(await list(), "bread")).toMatchObject({ amount: "2 slices" })
  })

  test("manages every-week items", async () => {
    const items = (await t.admin.get("/api/list/weekly")).body.items
    expect(items).toHaveLength(1)
    const updated = await t.admin.patch(`/api/list/weekly/${items[0].id}`, {
      amount: "3 × 12-pack",
    })
    expect(updated.body.item.amount).toBe("3 × 12-pack")
    // Already on the list, so not added twice.
    expect(
      (await t.admin.post("/api/list/weekly/add-to-list")).body.added
    ).toBe(0)
    expect(
      (await t.admin.delete(`/api/list/weekly/${items[0].id}`)).status
    ).toBe(204)
  })

  test("is per household", async () => {
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const other = apiClient(t.app)
    await other.post("/api/signup", {
      displayName: "Dana",
      username: "dana",
      password: "a long enough password",
      householdName: "Next Door",
    })
    expect((await other.get("/api/list")).body.items).toEqual([])
    const item = (await list())[0]!
    expect(
      (await other.patch(`/api/list/items/${item.id}`, { checked: true }))
        .status
    ).toBe(404)
    expect((await other.delete(`/api/list/items/${item.id}`)).status).toBe(404)
    const res = await other.post("/api/list/from-plan", {
      from: "2026-10-11",
      to: "2026-10-17",
    })
    expect(res.body.meals).toBe(0)
  })
})
