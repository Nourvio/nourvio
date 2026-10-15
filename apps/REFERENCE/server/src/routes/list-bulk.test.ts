import type { ShoppingItem, WeeklyItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("list items in bulk", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const list = async () =>
    (await t.admin.get("/api/list")).body.items as ShoppingItem[]
  const named = async (name: string) =>
    (await list()).find((item) => item.name === name)!
  const add = async (text: string) =>
    (await t.admin.post("/api/list/items", { text })).body.item as ShoppingItem
  const bulk = (body: Record<string, unknown>) =>
    t.admin.post("/api/list/bulk", body)

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    await t.admin.put("/api/household/lists", {
      lists: [
        { id: "main", name: "Groceries", store: null, sections: [] },
        { id: "costco", name: "Costco", store: "costco", sections: [] },
      ],
    })
  })
  afterAll(() => t.close())

  test("moves items to another list, and remembers it", async () => {
    const water = await add("sparkling water")
    const towels = await add("paper towels")
    const res = await bulk({
      action: "move",
      ids: [water.id, towels.id],
      listId: "costco",
    })
    expect(res.body).toEqual({ changed: 2 })
    expect((await named("sparkling water")).listId).toBe("costco")
    expect((await named("paper towels")).listId).toBe("costco")

    // Next time, it goes there by itself.
    await bulk({ action: "delete", ids: [water.id] })
    expect((await add("sparkling water")).listId).toBe("costco")

    expect(
      (await bulk({ action: "move", ids: [towels.id], listId: "aldi" })).status
    ).toBe(404)
  })

  test("changes the aisle, and remembers it", async () => {
    const tofu = await add("tofu")
    const tempeh = await add("tempeh")
    expect(
      (
        await bulk({
          action: "aisle",
          ids: [tofu.id, tempeh.id],
          sectionId: "international",
        })
      ).body
    ).toEqual({ changed: 2 })
    expect((await named("tofu")).sectionId).toBe("international")
    await bulk({ action: "delete", ids: [tofu.id] })
    expect((await add("tofu")).sectionId).toBe("international")
  })

  test("makes items every-week, once each", async () => {
    const milk = await add("1 gal milk")
    const bread = await add("bread")
    expect(
      (await bulk({ action: "weekly", ids: [milk.id, bread.id] })).body
    ).toEqual({ changed: 2 })
    // Again changes nothing.
    expect((await bulk({ action: "weekly", ids: [milk.id] })).body).toEqual({
      changed: 0,
    })
    const weekly = (await t.admin.get("/api/list/weekly")).body
      .items as WeeklyItem[]
    expect(weekly.map((item) => [item.name, item.amount])).toEqual([
      ["milk", "1 gal"],
      ["bread", null],
    ])
    // They count as this week's, so adding the every-week items doesn't
    // put them on twice.
    expect((await named("milk")).source).toBe("weekly")
    await t.admin.post("/api/list/weekly/add-to-list")
    expect((await list()).filter((item) => item.name === "milk")).toHaveLength(
      1
    )
  })

  test("removes items", async () => {
    const all = await list()
    expect(
      (await bulk({ action: "delete", ids: all.map((item) => item.id) })).body
    ).toEqual({ changed: all.length })
    expect(await list()).toEqual([])
  })

  test("another household's items are out of reach", async () => {
    const eggs = await add("eggs")
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    for (const body of [
      { action: "delete", ids: [eggs.id] },
      { action: "aisle", ids: [eggs.id], sectionId: "frozen" },
      { action: "weekly", ids: [eggs.id] },
    ]) {
      expect((await neighbor.post("/api/list/bulk", body)).body).toEqual({
        changed: 0,
      })
    }
    expect(await named("eggs")).toMatchObject({
      sectionId: eggs.sectionId,
      source: "manual",
    })
  })
})
