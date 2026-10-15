import { describe, expect, test } from "vitest"

import {
  autoPlanDue,
  autoPlanTarget,
  DEFAULT_AUTO_PLAN,
  localClock,
  weekAhead,
} from "./autoplan.ts"

// Saturday at 9 in Chicago is 14:00 UTC (daylight time in October).
const CHICAGO = "America/Chicago"
const saturday = (hour: number) =>
  new Date(Date.UTC(2026, 9, 17, hour + 5, 0, 0)) // Oct 17, 2026 is a Saturday

describe("autoplan", () => {
  test("reads the household's clock in its own time zone", () => {
    expect(localClock(new Date(Date.UTC(2026, 9, 18, 3)), CHICAGO)).toEqual({
      date: "2026-10-17", // still Saturday evening in Chicago
      weekday: 6,
      hour: 22,
    })
    // An unknown zone falls back to UTC.
    expect(
      localClock(new Date(Date.UTC(2026, 9, 18, 3)), "Nowhere/Land")
    ).toMatchObject({
      date: "2026-10-18",
      hour: 3,
    })
  })

  test("Saturday morning plans the week starting the next day", () => {
    const plan = { ...DEFAULT_AUTO_PLAN, enabled: true, timeZone: CHICAGO }
    // Before 9: the last run (a week ago) was for this week.
    expect(autoPlanTarget(plan, 0, saturday(8)).start).toBe("2026-10-11")
    // From 9: next week, Sunday the 18th.
    expect(autoPlanDue(plan, 0, saturday(9))).toEqual({
      week: "2026-10-18",
      from: "2026-10-18",
      to: "2026-10-24",
    })
    // Weeks starting Monday: the 19th.
    expect(autoPlanDue(plan, 1, saturday(9))?.week).toBe("2026-10-19")
  })

  test("runs once a week, and catches up a missed run before the week ends", () => {
    const plan = {
      ...DEFAULT_AUTO_PLAN,
      enabled: true,
      timeZone: CHICAGO,
      handledWeek: "2026-10-18",
    }
    expect(autoPlanDue(plan, 0, saturday(12))).toBeNull()
    // Missed (server off) until Tuesday the 20th: plans from that day on.
    const missed = { ...plan, handledWeek: "2026-10-11" }
    const tuesday = new Date(Date.UTC(2026, 9, 20, 15))
    expect(autoPlanDue(missed, 0, tuesday)).toEqual({
      week: "2026-10-18",
      from: "2026-10-20",
      to: "2026-10-24",
    })
    // Off is off.
    expect(autoPlanDue({ ...missed, enabled: false }, 0, tuesday)).toBeNull()
  })

  test("the week ahead is the next week starting today or later", () => {
    // Wednesday the 14th, weeks from Sunday: the 18th.
    const wednesday = new Date(Date.UTC(2026, 9, 14, 17))
    expect(weekAhead(0, CHICAGO, wednesday)).toEqual({
      week: "2026-10-18",
      from: "2026-10-18",
      to: "2026-10-24",
    })
    // On a Sunday with weeks from Sunday: that same week.
    const sunday = new Date(Date.UTC(2026, 9, 18, 17))
    expect(weekAhead(0, CHICAGO, sunday).week).toBe("2026-10-18")
  })
})
