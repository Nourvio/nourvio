import { describe, expect, it } from "vitest"

import { lineFood } from "./grocery.ts"
import { saleNudge, usualPrice, usualWorthShowing } from "./sales.ts"
import { householdTastesInput, mergeTastes, NO_TASTES } from "./tastes.ts"

describe("saleNudge", () => {
  it("counts meat and seafood most, then produce", () => {
    expect(saleNudge(["meat-seafood"], "some")).toBe(1)
    expect(saleNudge(["produce"], "some")).toBeCloseTo(0.4)
    expect(saleNudge(["meat-seafood", "produce"], "some")).toBeCloseTo(1.4)
  })

  it("leans harder on a lot, never at all when off, and caps it", () => {
    expect(saleNudge(["meat-seafood"], "lots")).toBe(2.5)
    expect(saleNudge(["meat-seafood", "meat-seafood"], "some")).toBe(1.5)
    expect(saleNudge(["meat-seafood", "meat-seafood"], "lots")).toBe(4)
    expect(saleNudge(["meat-seafood"], "off")).toBe(0)
    expect(saleNudge([], "lots")).toBe(0)
  })
})

describe("usualPrice", () => {
  const today = "2026-10-14"

  it("is the most common regular price over the past 90 days", () => {
    expect(
      usualPrice(
        [
          { day: "2026-09-01", price: 4.29 },
          { day: "2026-09-10", price: 4.29 },
          { day: "2026-09-20", price: 4.49 },
          { day: "2026-10-01", price: 4.29 },
          { day: "2026-10-14", price: 4.49 },
        ],
        today
      )
    ).toBe(4.29)
  })

  it("needs a few days over at least two weeks", () => {
    expect(
      usualPrice(
        [
          { day: "2026-10-10", price: 4.29 },
          { day: "2026-10-12", price: 4.29 },
          { day: "2026-10-14", price: 4.29 },
        ],
        today
      )
    ).toBeNull()
    expect(
      usualPrice(
        [
          { day: "2026-09-01", price: 4.29 },
          { day: "2026-10-14", price: 4.29 },
        ],
        today
      )
    ).toBeNull()
  })

  it("leaves out old prices and days without one, and ties go to the latest", () => {
    expect(
      usualPrice(
        [
          { day: "2026-05-01", price: 9.99 },
          { day: "2026-05-02", price: 9.99 },
          { day: "2026-09-01", price: 3.99 },
          { day: "2026-09-15", price: null },
          { day: "2026-09-20", price: 4.29 },
          { day: "2026-10-01", price: 3.99 },
          { day: "2026-10-10", price: 4.29 },
        ],
        today
      )
    ).toBe(4.29)
  })
})

describe("usualWorthShowing", () => {
  it("only when today's price is well under it", () => {
    expect(usualWorthShowing({ price: 4.29, salePrice: 2.99 }, 4.29)).toBe(4.29)
    expect(usualWorthShowing({ price: 4.19, salePrice: null }, 4.29)).toBe(null)
    expect(usualWorthShowing({ price: 3.49, salePrice: null }, 4.29)).toBe(4.29)
    expect(usualWorthShowing({ price: 4.29, salePrice: 2.99 }, null)).toBe(null)
  })
})

describe("lineFood", () => {
  it("names the thing to buy as the list would", () => {
    expect(lineFood("2 lb boneless chicken thighs")).toEqual({
      name: "boneless chicken thighs",
      key: "boneless chicken thigh",
    })
    expect(lineFood("Salt to taste")).toEqual({ name: "Salt", key: "salt" })
  })
})

describe("leaning on sales", () => {
  it("is a little by default, and kept when the assistant adds tastes", () => {
    expect(NO_TASTES.sales).toBe("some")
    const parsed = householdTastesInput.parse({
      avoid: [],
      diets: [],
      weeknightMinutes: null,
      notes: [],
    })
    expect(parsed.sales).toBe("some")
    expect(
      mergeTastes({ ...NO_TASTES, sales: "lots" }, { notes: ["Mild"] }).sales
    ).toBe("lots")
  })
})
