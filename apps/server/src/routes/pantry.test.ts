import { addDays, toIsoDate, type PantryItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { describePantry } from "../chat/tools.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("pantry", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const today = toIsoDate(new Date())
  const pantry = async () =>
    (await t.admin.get("/api/pantry")).body.items as PantryItem[]
  const find = (items: PantryItem[], name: string) =>
    items.find((i) => i.name.toLowerCase() === name.toLowerCase())

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
  })
  afterAll(() => t.close())

  test("takes typed items, guessing aisles and use-by dates", async () => {
    for (const text of ["2 lb chicken thighs", "rice", "3 onions"]) {
      expect((await t.admin.post("/api/pantry", { text })).status).toBe(201)
    }
    const items = await pantry()
    expect(find(items, "chicken thighs")).toMatchObject({
      amount: "2 lb",
      sectionId: "meat-seafood",
      useBy: addDays(today, 3),
    })
    // Rice and onions keep, so they get no use-by date.
    expect(find(items, "rice")).toMatchObject({ amount: "", useBy: null })
    expect(find(items, "onions")).toMatchObject({
      amount: "3",
      sectionId: "produce",
      useBy: null,
    })
    expect((await t.admin.post("/api/pantry", { text: " " })).status).toBe(400)
  })

  test("merges the same food", async () => {
    await t.admin.post("/api/pantry", {
      text: "1 lb boneless skinless chicken thighs",
    })
    await t.admin.post("/api/pantry", { text: "2 cups rice" })
    const items = await pantry()
    expect(items.filter((i) => i.name.includes("chicken"))).toHaveLength(1)
    expect(find(items, "chicken thighs")!.amount).toBe("3 lb")
    // "Have it" plus an amount is just the amount.
    expect(find(items, "rice")!.amount).toBe("2 cups")
  })

  test("edits and removes items", async () => {
    const rice = find(await pantry(), "rice")!
    const edited = await t.admin.patch(`/api/pantry/${rice.id}`, {
      name: "Jasmine rice",
      amount: "half a bag",
      useBy: "2026-12-01",
    })
    expect(edited.body.item).toMatchObject({
      name: "Jasmine rice",
      amount: "half a bag",
      quantity: null,
      useBy: "2026-12-01",
    })
    const cleared = await t.admin.patch(`/api/pantry/${rice.id}`, {
      amount: "",
      useBy: null,
    })
    expect(cleared.body.item).toMatchObject({ amount: "", useBy: null })

    expect((await t.admin.delete(`/api/pantry/${rice.id}`)).status).toBe(204)
    expect(find(await pantry(), "jasmine rice")).toBeUndefined()
    expect((await t.admin.delete(`/api/pantry/${rice.id}`)).status).toBe(404)
  })

  test("puts away what was bought, remembering the meals it's for", async () => {
    const tacos = (
      await t.admin.post("/api/recipes", {
        name: "Tacos",
        servings: 4,
        ingredients: ["1 lb ground beef", "8 tortillas", "salt"],
      })
    ).body.recipe
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: addDays(today, 2),
        meal: "dinner",
        recipeId: tacos.id,
      })
    ).body.entry
    await t.admin.post("/api/list/from-plan", {
      from: today,
      to: addDays(today, 6),
    })
    await t.admin.post("/api/list/items", { text: "paper towels" })
    await t.admin.post("/api/list/items", { text: "milk" })

    const list = (await t.admin.get("/api/list")).body.items as {
      id: string
      name: string
    }[]
    // Everything but the milk is bought.
    for (const item of list.filter((i) => i.name !== "milk")) {
      await t.admin.patch(`/api/list/items/${item.id}`, { checked: true })
    }

    const res = await t.admin.post("/api/list/put-away")
    expect(res.status).toBe(200)
    // Paper towels are household things; salt is always on hand.
    expect(res.body).toEqual({ stored: 2, skipped: 1 })
    const left = (await t.admin.get("/api/list")).body.items
    expect(left.map((i: { name: string }) => i.name)).toEqual(["milk"])

    const items = await pantry()
    expect(find(items, "ground beef")).toMatchObject({
      amount: "1 lb",
      useBy: addDays(today, 3),
      meals: [
        { id: entry.id, name: "Tacos", meal: "dinner", status: "planned" },
      ],
    })
    expect(find(items, "tortillas")).toMatchObject({ amount: "8" })
    expect(find(items, "paper towels")).toBeUndefined()
    expect(find(items, "salt")).toBeUndefined()
  })

  let curry: { id: string }

  test("leaves what's in the pantry off lists made from the plan", async () => {
    await t.admin.post("/api/pantry", { text: "rice" })
    const recipe = (
      await t.admin.post("/api/recipes", {
        name: "Chicken Curry",
        servings: 4,
        ingredients: [
          "2 lb boneless chicken thighs",
          "4 onions",
          "1 cup rice",
          "1 lb ground beef",
        ],
      })
    ).body.recipe
    curry = (
      await t.admin.post("/api/plan/entries", {
        date: addDays(today, 3),
        meal: "dinner",
        recipeId: recipe.id,
      })
    ).body.entry

    const res = await t.admin.post("/api/list/from-plan", {
      from: today,
      to: addDays(today, 6),
    })
    // 3 lb of thighs covers 2; "have it" rice covers a cup.
    expect(res.body.inPantry.sort()).toEqual([
      "boneless chicken thighs",
      "rice",
    ])
    const list = (await t.admin.get("/api/list")).body.items as {
      name: string
      amount: string
    }[]
    const amount = (name: string) => list.find((i) => i.name === name)?.amount
    // 3 onions at home, 4 needed.
    expect(amount("onions")).toBe("1")
    // The ground beef at home is for Thursday's tacos, so buy more.
    expect(amount("ground beef")).toBe("1 lb")
  })

  test("cooking uses it up, and un-cooking puts it back", async () => {
    const before = await pantry()
    const tacos = find(before, "ground beef")!.meals[0]!
    const cooked = await t.admin.patch(`/api/plan/entries/${tacos.id}`, {
      status: "cooked",
    })
    expect(cooked.body.entry.pantryUsed).toEqual(["ground beef", "tortillas"])
    let items = await pantry()
    expect(find(items, "ground beef")).toBeUndefined()
    expect(find(items, "tortillas")).toBeUndefined()

    const curryCooked = await t.admin.patch(`/api/plan/entries/${curry.id}`, {
      status: "cooked",
    })
    expect(curryCooked.body.entry.pantryUsed.sort()).toEqual([
      "chicken thighs",
      "onions",
    ])
    items = await pantry()
    expect(find(items, "chicken thighs")!.amount).toBe("1 lb")
    expect(find(items, "onions")).toBeUndefined()
    // "Have it" rice doesn't get used up by one meal.
    expect(find(items, "rice")).toBeDefined()

    const back = await t.admin.patch(`/api/plan/entries/${curry.id}`, {
      status: "planned",
    })
    expect(back.body.entry.pantryUsed).toEqual([])
    items = await pantry()
    expect(find(items, "chicken thighs")!.amount).toBe("3 lb")
    expect(find(items, "onions")).toMatchObject({
      id: find(before, "onions")!.id,
      amount: "3",
    })
  })

  test("reads to the assistant with what needs using first", async () => {
    const thighs = find(await pantry(), "chicken thighs")!
    await t.admin.patch(`/api/pantry/${thighs.id}`, { useBy: today })
    const text = describePantry(await pantry())
    expect(
      text.startsWith(
        `Needs using soon:\nchicken thighs (3 lb): use by ${today}`
      )
    ).toBe(true)
    expect(text).toContain("Also at home:")
    expect(text).toContain("rice")
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
    expect((await other.get("/api/pantry")).body.items).toEqual([])
    const item = (await pantry())[0]!
    expect(
      (await other.patch(`/api/pantry/${item.id}`, { amount: "1" })).status
    ).toBe(404)
    expect((await other.delete(`/api/pantry/${item.id}`)).status).toBe(404)
    expect((await other.post("/api/list/put-away")).body).toEqual({
      stored: 0,
      skipped: 0,
    })
    expect(await pantry()).not.toEqual([])
  })
})
