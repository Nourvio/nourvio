import type { AutoPlanRun, Household, PlanEntry } from "@mise/shared"
import { addDays } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { runDueAutoPlans } from "../services/autoplan.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("autoplan", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>

  const household = async () =>
    (await t.admin.get("/api/household")).body.household as Household
  const entries = async (from: string, to: string) =>
    (await t.admin.get(`/api/plan?from=${from}&to=${to}`)).body
      .entries as PlanEntry[]
  const schedule = {
    enabled: true,
    day: 6,
    hour: 9,
    addToList: true,
    timeZone: "UTC",
  }

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    for (const name of ["Chili", "Tacos", "Stir Fry"]) {
      await t.admin.post("/api/recipes", {
        name,
        ingredients: [`1 lb ${name.toLowerCase()} base`, "1 onion"],
      })
    }
  })
  afterAll(() => t.close())

  test("household admins set it up; turning it on waits for the next time", async () => {
    const res = await t.admin.put("/api/household/autoplan", schedule)
    expect(res.status).toBe(200)
    const { autoPlan } = res.body.household as Household
    expect(autoPlan).toMatchObject({ ...schedule, last: null })
    // The week of the most recent Saturday counts as handled already.
    expect(autoPlan.handledWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const invite = await t.admin.post("/api/household/invites", {
      role: "member",
    })
    const member = apiClient(t.app)
    await member.post(`/api/join/${invite.body.invite.token}`, {
      displayName: "Jamie",
      username: "jamie",
      password: "correct horse battery",
    })
    expect((await member.put("/api/household/autoplan", schedule)).status).toBe(
      403
    )
  })

  test("plans the week ahead now: empty meals filled, then the list", async () => {
    const res = await t.admin.post("/api/household/autoplan/run")
    expect(res.status).toBe(200)
    const run = res.body.run as AutoPlanRun
    // Three recipes, each used once; breakfasts and lunches need tagged recipes.
    expect(run.planned).toBe(3)
    expect(run.empty).toBe(21)
    expect(run.listed).toBeGreaterThan(0)
    const planned = await entries(run.week, addDays(run.week, 6))
    expect(planned).toHaveLength(3)
    expect(planned.every((entry) => entry.meal === "dinner")).toBe(true)
    expect(planned.every((entry) => entry.listed)).toBe(true)
    expect((await household()).autoPlan).toMatchObject({
      handledWeek: run.week,
      last: { week: run.week, planned: 3 },
    })
  })

  test("a scheduled run happens once, when it's due", async () => {
    // Four weeks on, Saturday at 10 UTC: due, and not handled yet.
    const { autoPlan } = await household()
    const saturday = new Date(`${addDays(autoPlan.handledWeek!, 27)}T10:00:00Z`)
    expect(saturday.getUTCDay()).toBe(6)
    await runDueAutoPlans(t.db, saturday)
    const after = (await household()).autoPlan
    expect(after.handledWeek).toBe(addDays(autoPlan.handledWeek!, 28))
    expect(after.last?.week).toBe(after.handledWeek)
    const count = (
      await entries(after.handledWeek!, addDays(after.handledWeek!, 6))
    ).length
    expect(count).toBeGreaterThan(0)

    // Checking again doesn't plan it twice.
    await runDueAutoPlans(t.db, new Date(saturday.getTime() + 3_600_000))
    expect(
      (await entries(after.handledWeek!, addDays(after.handledWeek!, 6))).length
    ).toBe(count)
  })

  test("off means off", async () => {
    await t.admin.put("/api/household/autoplan", {
      ...schedule,
      enabled: false,
    })
    const { autoPlan } = await household()
    const later = new Date(`${addDays(autoPlan.handledWeek!, 13)}T10:00:00Z`)
    await runDueAutoPlans(t.db, later)
    expect((await household()).autoPlan.handledWeek).toBe(autoPlan.handledWeek)
  })
})
