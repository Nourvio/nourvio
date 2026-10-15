import type { PlanEntry, ShoppingItem } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** A week well ahead, so nothing in it is today. */
const LAST = "2026-11-01"
const THIS = "2026-11-08"

describe("planned meals in bulk", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ids: Record<string, string> = {}

  const plan = async (from = LAST, to = "2026-11-21") =>
    (await t.admin.get(`/api/plan?from=${from}&to=${to}`)).body
      .entries as PlanEntry[]
  /** "date meal name status", sorted: the plan orders a day by when things were added. */
  const slots = (entries: PlanEntry[]) =>
    entries
      .map(
        (entry) =>
          `${entry.date} ${entry.meal} ${entry.recipe?.name ?? entry.note} ${entry.status}`
      )
      .sort()
  const plant = async (body: Record<string, unknown>) =>
    (await t.admin.post("/api/plan/entries", body)).body.entry as PlanEntry
  const bulk = (body: Record<string, unknown>) =>
    t.admin.post("/api/plan/bulk", body)

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    for (const recipe of [
      { name: "Tacos", servings: 4, ingredients: ["1 lb ground beef"] },
      { name: "Soup", servings: 2, ingredients: ["2 onions"] },
    ]) {
      ids[recipe.name] = (
        await t.admin.post("/api/recipes", recipe)
      ).body.recipe.id
    }
  })
  afterAll(() => t.close())

  test("moves meals to another day, keeping the meal unless one's given", async () => {
    const tacos = await plant({
      date: THIS,
      meal: "dinner",
      recipeId: ids.Tacos,
    })
    const soup = await plant({ date: THIS, meal: "lunch", recipeId: ids.Soup })
    expect(
      (
        await bulk({
          action: "move",
          ids: [tacos.id, soup.id],
          date: "2026-11-10",
        })
      ).body
    ).toEqual({ changed: 2 })
    expect(slots(await plan(THIS, "2026-11-14"))).toEqual([
      "2026-11-10 dinner Tacos planned",
      "2026-11-10 lunch Soup planned",
    ])
    await bulk({
      action: "move",
      ids: [soup.id],
      date: "2026-11-11",
      meal: "dinner",
    })
    expect(slots(await plan("2026-11-11", "2026-11-11"))).toEqual([
      "2026-11-11 dinner Soup planned",
    ])
  })

  test("puts their ingredients on the list, scaled, once", async () => {
    const [tacos, soup] = await plan(THIS, "2026-11-14")
    await t.admin.patch(`/api/plan/entries/${soup!.id}`, { servings: 4 })
    expect(
      (await bulk({ action: "toList", ids: [tacos!.id, soup!.id] })).body
    ).toEqual({ changed: 2 })
    const list = (await t.admin.get("/api/list")).body.items as ShoppingItem[]
    expect(list.map((item) => `${item.amount} ${item.name}`).sort()).toEqual([
      "1 lb ground beef",
      "4 onions",
    ])
    // They're on the list now, so again adds nothing.
    expect(
      (await bulk({ action: "toList", ids: [tacos!.id, soup!.id] })).body
    ).toEqual({ changed: 0 })
  })

  test("marks meals cooked, skipped or planned again", async () => {
    const [tacos, soup] = await plan(THIS, "2026-11-14")
    expect(
      (
        await bulk({
          action: "status",
          ids: [tacos!.id, soup!.id],
          status: "cooked",
        })
      ).body
    ).toEqual({ changed: 2 })
    // Cooking a planned meal counts as making the recipe.
    const made = (await t.admin.get(`/api/recipes/${ids.Tacos}`)).body.recipe
    expect(made.lastMadeAt).not.toBeNull()
    // Already cooked: nothing changes.
    expect(
      (await bulk({ action: "status", ids: [tacos!.id], status: "cooked" }))
        .body
    ).toEqual({ changed: 0 })
    await bulk({ action: "status", ids: [soup!.id], status: "skipped" })
    expect(slots(await plan(THIS, "2026-11-14"))).toEqual([
      "2026-11-10 dinner Tacos cooked",
      "2026-11-11 dinner Soup skipped",
    ])
  })

  test("repeats last week where this week is empty", async () => {
    await plant({ date: LAST, meal: "dinner", recipeId: ids.Tacos })
    await plant({ date: LAST, meal: "lunch", note: "Leftovers" })
    await plant({
      date: "2026-11-03",
      meal: "dinner",
      recipeId: ids.Soup,
      servings: 6,
    })
    // Skipped meals stay behind; Tuesday dinner (Soup) is taken this week.
    const skipped = await plant({
      date: "2026-11-02",
      meal: "dinner",
      recipeId: ids.Soup,
    })
    await t.admin.patch(`/api/plan/entries/${skipped.id}`, {
      status: "skipped",
    })
    await plant({ date: "2026-11-10", meal: "breakfast", note: "Toast" })

    const res = await t.admin.post("/api/plan/week", {
      action: "repeat",
      start: THIS,
    })
    expect(slots(res.body.entries)).toEqual([
      "2026-11-08 dinner Tacos planned",
      "2026-11-08 lunch Leftovers planned",
    ])
    // Tuesday already had dinner, so last Tuesday's Soup didn't come.
    expect(slots(await plan("2026-11-10", "2026-11-10"))).toEqual([
      "2026-11-10 breakfast Toast planned",
      "2026-11-10 dinner Tacos cooked",
    ])
  })

  test("removes meals", async () => {
    const week = await plan(THIS, "2026-11-14")
    expect(
      (await bulk({ action: "delete", ids: week.map((entry) => entry.id) }))
        .body
    ).toEqual({ changed: week.length })
    expect(await plan(THIS, "2026-11-14")).toEqual([])
  })

  test("another household's plan is out of reach", async () => {
    const tacos = await plant({
      date: THIS,
      meal: "dinner",
      recipeId: ids.Tacos,
    })
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    for (const body of [
      { action: "delete", ids: [tacos.id] },
      { action: "move", ids: [tacos.id], date: "2026-11-12" },
      { action: "status", ids: [tacos.id], status: "skipped" },
      { action: "toList", ids: [tacos.id] },
    ]) {
      expect((await neighbor.post("/api/plan/bulk", body)).body).toEqual({
        changed: 0,
      })
    }
    // Their own week is empty, so there's nothing to repeat into it.
    expect(
      (
        await neighbor.post("/api/plan/week", {
          action: "repeat",
          start: "2026-11-15",
        })
      ).body.entries
    ).toEqual([])
    expect(slots(await plan(THIS, THIS))).toEqual([
      "2026-11-08 dinner Tacos planned",
    ])
  })
})
