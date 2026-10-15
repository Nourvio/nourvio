import type { PantryItem, ShoppingItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("pantry items in bulk", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const pantry = async () =>
    (await t.admin.get("/api/pantry")).body.items as PantryItem[]
  const named = async (name: string) =>
    (await pantry()).find((item) => item.name === name)!
  const add = async (text: string) =>
    (await t.admin.post("/api/pantry", { text })).body.item as PantryItem
  const bulk = (body: Record<string, unknown>) =>
    t.admin.post("/api/pantry/bulk", body)

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
  })
  afterAll(() => t.close())

  test("sets the use-by date, or takes it off", async () => {
    const milk = await add("1 gal milk")
    const yogurt = await add("yogurt")
    const ids = [milk.id, yogurt.id]
    expect(
      (await bulk({ action: "useBy", ids, useBy: "2026-10-20" })).body
    ).toEqual({ changed: 2 })
    expect((await named("milk")).useBy).toBe("2026-10-20")
    expect((await named("yogurt")).useBy).toBe("2026-10-20")
    await bulk({ action: "useBy", ids: [yogurt.id], useBy: null })
    expect((await named("yogurt")).useBy).toBeNull()
  })

  test("changes the aisle, and remembers it", async () => {
    const tortillas = await add("tortillas")
    expect(
      (
        await bulk({
          action: "aisle",
          ids: [tortillas.id],
          sectionId: "international",
        })
      ).body
    ).toEqual({ changed: 1 })
    expect((await named("tortillas")).sectionId).toBe("international")
    // The list puts it there too now.
    const onList = (
      await t.admin.post("/api/list/items", { text: "tortillas" })
    ).body.item as ShoppingItem
    expect(onList.sectionId).toBe("international")
  })

  test("puts things on the list again, once each", async () => {
    const milk = await named("milk")
    const yogurt = await named("yogurt")
    const tortillas = await named("tortillas")
    // Tortillas are on the list already.
    expect(
      (
        await bulk({
          action: "toList",
          ids: [milk.id, yogurt.id, tortillas.id],
        })
      ).body
    ).toEqual({ changed: 2 })
    const list = (await t.admin.get("/api/list")).body.items as ShoppingItem[]
    expect(list.map((item) => item.name).sort()).toEqual([
      "milk",
      "tortillas",
      "yogurt",
    ])
    // Still at home: it's for buying more.
    expect(await pantry()).toHaveLength(3)
  })

  test("uses things up", async () => {
    const all = await pantry()
    expect(
      (await bulk({ action: "delete", ids: all.map((item) => item.id) })).body
    ).toEqual({ changed: 3 })
    expect(await pantry()).toEqual([])
  })

  test("another household's pantry is out of reach", async () => {
    const rice = await add("rice")
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    for (const body of [
      { action: "delete", ids: [rice.id] },
      { action: "useBy", ids: [rice.id], useBy: "2026-01-01" },
      { action: "aisle", ids: [rice.id], sectionId: "frozen" },
      { action: "toList", ids: [rice.id] },
    ]) {
      expect((await neighbor.post("/api/pantry/bulk", body)).body).toEqual({
        changed: 0,
      })
    }
    expect(await named("rice")).toMatchObject({
      sectionId: rice.sectionId,
      useBy: rice.useBy,
    })
    expect((await neighbor.get("/api/list")).body.items).toEqual([])
  })
})
