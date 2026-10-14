import { describe, expect, test } from "vitest"

import { addDays, daysBetween, startOfWeek, weekdayOf } from "./plan.ts"

describe("plan dates", () => {
  test("add days across months, years and daylight saving", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    // US daylight saving ends on 2026-11-01.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02")
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07")
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31)
  })

  test("finds the start of the week", () => {
    expect(weekdayOf("2026-10-14")).toBe(3) // a Wednesday
    expect(startOfWeek("2026-10-14", 0)).toBe("2026-10-11") // Sunday
    expect(startOfWeek("2026-10-14", 1)).toBe("2026-10-12") // Monday
    expect(startOfWeek("2026-10-11", 0)).toBe("2026-10-11")
    expect(startOfWeek("2026-10-11", 1)).toBe("2026-10-05")
  })
})
