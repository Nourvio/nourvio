import { addDays, toIsoDate, type PantryItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

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
