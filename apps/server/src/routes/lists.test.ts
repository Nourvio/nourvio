import type { Basket, Household, ShoppingItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createTestAppWithAdmin } from "../test/helpers.ts"

const LISTS = [
  { id: "main", name: "Fry's", store: null, sections: [] },
  {
    id: "costco",
    name: "Costco",
    store: "costco",
    sections: ["meat-seafood", "beverages"],
  },
]

describe("shopping lists", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>

  const items = async () =>
    (await t.admin.get("/api/list")).body.items as ShoppingItem[]
  const item = async (name: string) =>
    (await items()).find((i) => i.name === name)!
  const add = async (text: string, listId?: string) =>
    (await t.admin.post("/api/list/items", { text, listId })).body
      .item as ShoppingItem

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
  })
  afterAll(() => t.close())

  test("one list to start, with everything on it", async () => {
    const household = (await t.admin.get("/api/household")).body
      .household as Household
    expect(household.lists).toEqual([
      { id: "main", name: "Groceries", store: null, sections: [] },
    ])
    expect((await add("2 lb chicken thighs")).listId).toBe("main")
    await t.admin.delete(`/api/list/items/${(await item("chicken thighs")).id}`)
  })

  test("lists for stores, with aisles that go on them", async () => {
    // Already on the list: moves when its aisle gets a list.
    const soda = await add("Diet Pepsi")
    expect(soda.listId).toBe("main")
    const res = await t.admin.put("/api/household/lists", { lists: LISTS })
    expect((await item("Diet Pepsi")).listId).toBe("costco")
    await t.admin.delete(`/api/list/items/${soda.id}`)
    expect(res.status).toBe(200)
    expect((res.body.household as Household).lists).toEqual(LISTS)

    const bad = async (lists: unknown) =>
      (await t.admin.put("/api/household/lists", { lists })).status
    expect(await bad([LISTS[1]])).toBe(400)
    expect(
      await bad([
        LISTS[0],
        { ...LISTS[1], id: "c2", sections: ["meat-seafood"], store: null },
        LISTS[1],
      ])
    ).toBe(400)
    expect(await bad([{ ...LISTS[0], store: "costco" }, LISTS[1]])).toBe(400)
  })

  test("things go on the list their aisle goes on", async () => {
    expect((await add("2 lb chicken thighs")).listId).toBe("costco")
    expect((await add("milk")).listId).toBe("main")
    // Put somewhere on purpose.
    expect((await add("paper towels", "costco")).listId).toBe("costco")

    await t.admin.post("/api/list/weekly", {
      name: "Diet Pepsi",
      amount: "2 × 12-pack",
      sectionId: "beverages",
    })
    await t.admin.post("/api/list/weekly/add-to-list", {})
    expect((await item("Diet Pepsi")).listId).toBe("costco")
  })

  test("so do ingredients from the plan", async () => {
    const recipe = (
      await t.admin.post("/api/recipes", {
        name: "Beef tacos",
        ingredients: ["1 lb ground beef", "1 onion"],
      })
    ).body.recipe
    const date = new Date().toISOString().slice(0, 10)
    await t.admin.post("/api/plan/entries", {
      date,
      meal: "dinner",
      recipeId: recipe.id,
    })
    await t.admin.post("/api/list/from-plan", { from: date, to: date })
    expect((await item("ground beef")).listId).toBe("costco")
    expect((await item("onion")).listId).toBe("main")
  })

  test("moving something teaches Mise where that food goes", async () => {
    const milk = await item("milk")
    const moved = await t.admin.patch(`/api/list/items/${milk.id}`, {
      listId: "costco",
    })
    expect((moved.body.item as ShoppingItem).listId).toBe("costco")
    await t.admin.delete(`/api/list/items/${milk.id}`)
    expect((await add("1 gallon milk")).listId).toBe("costco")

    // Moving one back to the main list beats its aisle's rule.
    const chicken = await item("chicken thighs")
    await t.admin.patch(`/api/list/items/${chicken.id}`, { listId: "main" })
    await t.admin.delete(`/api/list/items/${chicken.id}`)
    expect((await add("3 lb chicken thighs")).listId).toBe("main")

    expect(
      (await t.admin.patch(`/api/list/items/${chicken.id}`, { listId: "gone" }))
        .status
    ).toBe(404)
  })

  test("each store shops from its own list", async () => {
    // Walmart has no list of its own: it shops from lists for no store (Fry's, the main one).
    const walmart = (await t.admin.get("/api/shop/walmart/basket")).body
      .basket as Basket
    expect(walmart.lines.map((l) => l.name).sort()).toEqual([
      "chicken thighs",
      "onion",
    ])
  })

  test("removing a list moves its things to the main list", async () => {
    await t.admin.put("/api/household/lists", { lists: [LISTS[0]] })
    const all = await items()
    expect(all.every((i) => i.listId === "main")).toBe(true)
    // What was learned for it is gone too.
    await t.admin.put("/api/household/lists", { lists: LISTS })
    const milk = all.find((i) => i.name === "milk")!
    await t.admin.delete(`/api/list/items/${milk.id}`)
    expect((await add("milk")).listId).toBe("main")
  })
})
