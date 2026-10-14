import { describe, expect, test } from "vitest"

import {
  lineCost,
  packagesFor,
  parseProductSize,
  type Need,
} from "./shopping.ts"

const need = (partial: Partial<Need>): Need => ({
  count: null,
  grams: null,
  ml: null,
  eachGrams: null,
  ...partial,
})

describe("package sizes", () => {
  test.each([
    ["1 gal", { kind: "volume", amount: 3785.41 }],
    ["1/2 gal", { kind: "volume", amount: 1892.705 }],
    [".5 gal", { kind: "volume", amount: 1892.705 }],
    ["16 oz", { kind: "weight", amount: 453.592 }],
    ["3 lb bag", { kind: "weight", amount: 1360.776 }],
    ["32 fl oz", { kind: "volume", amount: 946.352 }],
    ["64 FL. OZ.", { kind: "volume", amount: 1892.704 }],
    ["12 ct", { kind: "count", amount: 12 }],
    ["1 each", { kind: "count", amount: 1 }],
    ["1 dozen", { kind: "count", amount: 12 }],
    ["500g", { kind: "weight", amount: 500 }],
    ["1.5 L", { kind: "volume", amount: 1500 }],
    ["6 ct / 12 fl oz", { kind: "volume", amount: 2129.292 }],
    ["12 x 1 oz", { kind: "weight", amount: 340.194 }],
  ])("%s", (text, expected) => {
    const size = parseProductSize(text)!
    expect(size.kind).toBe(expected.kind)
    expect(size.amount).toBeCloseTo(expected.amount, 1)
  })

  test("unreadable", () => {
    expect(parseProductSize(null)).toBeNull()
    expect(parseProductSize("family size")).toBeNull()
    expect(parseProductSize("12 widgets")).toBeNull()
  })
})

describe("packages to buy", () => {
  const gallon = parseProductSize("1 gal")
  const pound = parseProductSize("1 lb")
  const dozen = parseProductSize("12 ct")
  const each = parseProductSize("1 each")

  test("by weight, with a little leeway", () => {
    expect(packagesFor(need({ grams: 200 }), pound)).toEqual({
      packages: 1,
      sure: true,
    })
    expect(packagesFor(need({ grams: 480 }), pound).packages).toBe(1)
    expect(packagesFor(need({ grams: 907 }), pound).packages).toBe(2)
    expect(packagesFor(need({ grams: 1000 }), pound).packages).toBe(3)
  })

  test("by volume", () => {
    expect(packagesFor(need({ ml: 473 }), gallon)).toEqual({
      packages: 1,
      sure: true,
    })
    expect(packagesFor(need({ ml: 5000 }), gallon).packages).toBe(2)
  })

  test("by count, and by the each from a weight", () => {
    expect(packagesFor(need({ count: 3 }), dozen)).toEqual({
      packages: 1,
      sure: true,
    })
    expect(packagesFor(need({ count: 18 }), dozen).packages).toBe(2)
    expect(packagesFor(need({ count: 2 }), each).packages).toBe(2)
    // 1 lb of onions, sold by the each at 110 g an onion: 5 onions.
    expect(packagesFor(need({ grams: 453.6, eachGrams: 110 }), each)).toEqual({
      packages: 5,
      sure: true,
    })
  })

  test("a guess to check when the two can't be compared", () => {
    expect(packagesFor(need({ count: 2 }), pound)).toEqual({
      packages: 1,
      sure: false,
    })
    expect(packagesFor(need({}), gallon)).toEqual({ packages: 1, sure: false })
    expect(packagesFor(need({ count: 3 }), null)).toEqual({
      packages: 3,
      sure: false,
    })
    expect(packagesFor(need({ ml: 400 }), pound)).toEqual({
      packages: 1,
      sure: false,
    })
  })

  test("what a line costs, on sale or not", () => {
    const product = {
      id: "1",
      upc: null,
      name: "Milk",
      brand: null,
      size: "1 gal",
      image: null,
      price: 3.49,
      salePrice: null,
      aisle: null,
      aisleNumber: null,
      inStock: true,
      url: null,
    }
    expect(lineCost({ product, packages: 2 })).toBeCloseTo(6.98)
    expect(
      lineCost({ product: { ...product, salePrice: 2.5 }, packages: 2 })
    ).toBe(5)
    expect(lineCost({ product: null, packages: 1 })).toBeNull()
  })
})
