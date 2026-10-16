import { describe, expect, test } from "vitest"
import { STORES, STORES_BY_KEY, storesFor } from "./stores.ts"

describe("stores", () => {
  test("are offered for the household's country, by name", () => {
    const names = storesFor("GB").map((store) => store.name)
    expect(names).toContain("Tesco")
    expect(names).toContain("Aldi")
    expect(names).not.toContain("Kroger")
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(storesFor("us").map((store) => store.key)).toContain("kroger")
  })

  test("are none for a country Merran has none for, and all for no country", () => {
    expect(storesFor("ZZ")).toEqual([])
    expect(storesFor(null)).toHaveLength(STORES.length)
  })

  test("have keys of their own", () => {
    expect(STORES_BY_KEY.size).toBe(STORES.length)
    for (const store of STORES) expect(store.key).toMatch(/^[a-z0-9-]+$/)
  })
})
