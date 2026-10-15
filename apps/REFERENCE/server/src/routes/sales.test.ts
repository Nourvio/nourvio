import {
  addDays,
  localClock,
  type Basket,
  type Deals,
  type ListPrices,
  type MealSuggestion,
  type PriceCheck,
  type ShopStatus,
} from "@mise/shared"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { shopConnections, storePrices, storeProducts } from "../db/schema.ts"
import { priceCheckDue } from "../services/price-checks.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

/** A product as Kroger's API returns it. */
const kroger = (
  id: string,
  description: string,
  size: string,
  price: number,
  promo = 0,
  expires?: string
) => ({
  productId: id,
  upc: id,
  description,
  brand: "Kroger",
  aisleLocations: [],
  images: [],
  items: [
    {
      size,
      price: {
        regular: price,
        promo,
        ...(expires
          ? {
              expirationDate: {
                value: `${expires}T23:59:59Z`,
                timezone: "UTC",
              },
            }
          : {}),
      },
    },
  ],
})

const CATALOG = {
  thighs: kroger(
    "101",
    "Boneless Skinless Chicken Thighs",
    "3 lb",
    9.99,
    5.99,
    "2099-12-31"
  ),
  onion: kroger("102", "Yellow Onion", "1 each", 0.99),
  carrots: kroger("103", "Carrots", "2 lb", 1.99),
  salmon: kroger("104", "Atlantic Salmon Fillet", "1 lb", 11.99, 8.99),
}

const STORE = {
  locationId: "66000123",
  chain: "FRYS",
  name: "Fry's Food Stores - Tempe",
  address: { addressLine1: "1 Main St", city: "Tempe", state: "AZ" },
}

describe("Fry's sales", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const searches: string[] = []
  let byId = 0
  const recipeIds: Record<string, string> = {}

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })

  const krogerFetch: typeof fetch = async (input) => {
    const url = new URL(String(input))
    const path = url.pathname.replace("/v1", "")
    if (path === "/connect/oauth2/token") {
      return json({ access_token: "app-token", expires_in: 1800 })
    }
    if (path === "/locations") return json({ data: [STORE] })
    if (path === `/locations/${STORE.locationId}`) return json({ data: STORE })
    if (path === "/products") {
      const ids = url.searchParams.get("filter.productId")
      if (ids) {
        byId++
        return json({
          data: Object.values(CATALOG).filter((p) =>
            ids.split(",").includes(p.productId)
          ),
        })
      }
      const term = url.searchParams.get("filter.term") ?? ""
      searches.push(term)
      if (/thigh/.test(term)) return json({ data: [CATALOG.thighs] })
      if (/onion/.test(term)) return json({ data: [CATALOG.onion] })
      if (/carrot/.test(term)) return json({ data: [CATALOG.carrots] })
      if (/salmon/.test(term)) return json({ data: [CATALOG.salmon] })
      return json({ data: [] })
    }
    return json({ error: "unexpected" }, 404)
  }

  const check = async () => {
    const res = await t.admin.post("/api/shop/kroger/prices", {})
    expect(res.status).toBe(200)
    return res.body.check as PriceCheck
  }
  const deals = async () =>
    (await t.admin.get("/api/shop/deals")).body.deals as Deals
  const setSales = (sales: string) =>
    t.admin.put("/api/household/tastes", {
      avoid: [],
      diets: [],
      weeknightMinutes: null,
      notes: [],
      sales,
    })

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ krogerFetch })
    await t.admin.put("/api/shop/kroger/app", {
      clientId: "mise-app",
      clientSecret: "shh-secret",
    })
    await t.admin.put("/api/shop/kroger", { locationId: STORE.locationId })
    const recipes = [
      {
        name: "Chicken Thigh Tacos",
        ingredients: ["2 lb boneless chicken thighs", "1 onion", "8 tortillas"],
      },
      {
        name: "Lentil Soup",
        ingredients: ["1 cup lentils", "2 carrots", "1 onion"],
      },
      { name: "Salmon Bowl", ingredients: ["1 lb salmon", "1 cup rice"] },
      { name: "Lamb Stew", ingredients: ["1 lb lamb shoulder"] },
    ]
    for (const recipe of recipes) {
      const res = await t.admin.post("/api/recipes", recipe)
      recipeIds[recipe.name] = res.body.recipe.id
    }
  })
  afterAll(() => t.close())

  test("there's nothing on sale before prices are checked", async () => {
    expect(await deals()).toMatchObject({
      storeName: "Fry's",
      checkedAt: null,
      deals: [],
      recipes: {},
    })
  })

  test("the first check looks up the recipes' foods, for sales and costs", async () => {
    const result = await check()
    // Every food the recipes use; meat, seafood and produce first.
    expect(result).toEqual({ refreshed: 0, searched: 8, onSale: 2 })
    expect(searches.slice(0, 4).sort()).toEqual([
      "boneless chicken thighs",
      "carrots",
      "onion",
      "salmon",
    ])
    expect(searches.sort()).toEqual([
      "boneless chicken thighs",
      "carrots",
      "lamb shoulder",
      "lentils",
      "onion",
      "rice",
      "salmon",
      "tortillas",
    ])
    const status = (await t.admin.get("/api/shop")).body.status as ShopStatus
    expect(status.kroger.pricesCheckedAt).not.toBeNull()
  })

  test("later checks refresh what's remembered and don't look anything up again", async () => {
    searches.length = 0
    const before = byId
    // Salmon's sale ended.
    CATALOG.salmon.items[0]!.price.promo = 0
    expect(await check()).toEqual({ refreshed: 4, searched: 0, onSale: 1 })
    expect(byId - before).toBe(1)
    // Lamb found nothing, and isn't looked up again for a while.
    expect(searches).toEqual([])
  })

  test("deals say what's on sale and which recipes use it", async () => {
    const found = await deals()
    expect(found.deals).toEqual([
      {
        key: "boneless chicken thigh",
        product: "Boneless Skinless Chicken Thighs",
        price: 9.99,
        salePrice: 5.99,
        saleEnds: "2099-12-31",
        section: "meat-seafood",
      },
    ])
    expect(found.recipes).toEqual({
      [recipeIds["Chicken Thigh Tacos"]!]: [
        {
          food: "boneless chicken thighs",
          key: "boneless chicken thigh",
          price: 9.99,
          salePrice: 5.99,
        },
      ],
    })
  })

  test("suggestions say what's on sale, unless the household turned it off", async () => {
    const today = localClock(new Date(), "UTC").date
    // A slot for each recipe, so each is suggested once.
    const slots = [0, 1, 2, 3].map((n) => ({
      date: addDays(today, n + 1),
      meal: "dinner",
    }))
    const suggest = async () =>
      (await t.admin.post("/api/plan/suggest", { slots })).body
        .suggestions as MealSuggestion[]

    const onSale = Object.fromEntries(
      (await suggest()).map((s) => [
        s.recipe.name,
        s.onSale.map((sale) => `${sale.food} $${sale.salePrice}`),
      ])
    )
    expect(onSale).toEqual({
      "Chicken Thigh Tacos": ["boneless chicken thighs $5.99"],
      "Lentil Soup": [],
      "Salmon Bowl": [],
      "Lamb Stew": [],
    })

    expect((await setSales("off")).status).toBe(200)
    expect((await suggest()).every((s) => s.onSale.length === 0)).toBe(true)
    await setSales("some")
  })

  test("the list shows the sale, what it saves and what it usually costs", async () => {
    const household = (await t.admin.get("/api/household")).body.household
    const today = localClock(new Date(), "UTC").date
    // Thighs have been $10.49 most weeks.
    await t.db.insert(storePrices).values(
      [40, 30, 20, 10].map((ago) => ({
        householdId: household.id,
        shop: "kroger" as const,
        productId: "101",
        day: addDays(today, -ago),
        price: 10.49,
        salePrice: null,
      }))
    )
    const item = (
      await t.admin.post("/api/list/items", {
        text: "3 lb boneless chicken thighs",
      })
    ).body.item
    const prices = (await t.admin.get("/api/shop/prices")).body
      .prices as ListPrices
    expect(prices[item.id]).toMatchObject({
      shop: "kroger",
      total: 5.99,
      sale: true,
      saved: 4,
      saleEnds: "2099-12-31",
      usual: 10.49,
    })

    const basket = (await t.admin.get("/api/shop/kroger/basket")).body
      .basket as Basket
    expect(basket.lines.find((line) => line.itemId === item.id)).toMatchObject({
      usual: 10.49,
      product: { salePrice: 5.99 },
    })
  })

  test("a sale that has ended isn't counted", async () => {
    CATALOG.thighs.items[0]!.price = {
      regular: 9.99,
      promo: 5.99,
      expirationDate: { value: "2020-01-01T23:59:59Z", timezone: "UTC" },
    } as never
    await check()
    expect((await deals()).deals).toEqual([])
    const prices = Object.values(
      (await t.admin.get("/api/shop/prices")).body.prices as ListPrices
    )
    expect(prices[0]).toMatchObject({ total: 9.99, sale: false, saved: null })
  })
})

describe("the daily price check", () => {
  test("runs once a day, from 5 in the morning where the household is", () => {
    const phoenix = "America/Phoenix"
    // 04:30 in Phoenix (UTC-7) is 11:30 UTC.
    expect(priceCheckDue(null, phoenix, new Date("2026-10-14T11:30:00Z"))).toBe(
      false
    )
    expect(priceCheckDue(null, phoenix, new Date("2026-10-14T12:30:00Z"))).toBe(
      true
    )
    const checked = new Date("2026-10-14T13:00:00Z")
    expect(
      priceCheckDue(checked, phoenix, new Date("2026-10-15T02:00:00Z"))
    ).toBe(false)
    expect(
      priceCheckDue(checked, phoenix, new Date("2026-10-15T12:05:00Z"))
    ).toBe(true)
  })
})

describe("the price check with the AI picking", () => {
  test("looks again each week for Nourvio's picks, never for what someone chose", async () => {
    const asked: string[] = []
    // Picks the sale option when there is one, and turns down the crackers.
    const aiFactory: AiProviderFactory = (id) => ({
      id,
      async extract(request) {
        const text = request.parts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("")
        asked.push(text)
        const picks = text.split("\n\n").map((block, item) => {
          const options = block.split("\n").slice(1)
          if (options.every((o) => /cracker/i.test(o))) {
            return { item, choice: null }
          }
          const sale = options.findIndex((o) => o.includes("on sale"))
          return { item, choice: sale === -1 ? 0 : sale }
        })
        return {
          data: { picks },
          usage: { inputTokens: 300, outputTokens: 20 },
        } as never
      },
      async listModels() {
        return []
      },
    })
    let thighsOnSale = false
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      })
    const thighs = kroger("201", "Heritage Farm Chicken Thighs", "1 lb", 3.99)
    const fosters = () =>
      kroger(
        "202",
        "Foster Farms Chicken Thighs",
        "1 lb",
        2.99,
        thighsOnSale ? 1.99 : 0
      )
    const krogerFetch: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/token")) {
        return json({ access_token: "app", expires_in: 1800 })
      }
      if (url.pathname.endsWith(`/locations/${STORE.locationId}`)) {
        return json({ data: STORE })
      }
      const ids = url.searchParams.get("filter.productId")
      const all = [thighs, fosters(), CATALOG.onion]
      if (ids) {
        return json({
          data: all.filter((p) => ids.split(",").includes(p.productId)),
        })
      }
      const term = url.searchParams.get("filter.term") ?? ""
      if (/thigh/.test(term)) return json({ data: [thighs, fosters()] })
      if (/onion/.test(term)) return json({ data: [CATALOG.onion] })
      if (/garlic/.test(term)) {
        return json({
          data: [kroger("203", "Roasted Garlic Crackers", "6 oz", 5.99)],
        })
      }
      return json({ data: [] })
    }
    const t = await createTestAppWithAdmin({ aiFactory, krogerFetch })
    try {
      await t.admin.put("/api/ai/settings", {
        keys: { anthropic: "sk-ant-test-key-1234" },
      })
      await t.admin.put("/api/shop/kroger/app", {
        clientId: "app",
        clientSecret: "secret",
      })
      await t.admin.put("/api/shop/kroger", { locationId: STORE.locationId })
      await t.admin.post("/api/recipes", {
        name: "Sheet Pan Thighs",
        ingredients: ["2 lb chicken thighs", "1 onion", "4 garlic cloves"],
      })
      const check = async () =>
        (await t.admin.post("/api/shop/kroger/prices", {})).body
          .check as PriceCheck
      const household = (await t.admin.get("/api/household")).body.household
      const remembered = async () =>
        Object.fromEntries(
          (
            await t.db
              .select()
              .from(storeProducts)
              .where(eq(storeProducts.householdId, household.id))
          ).map((row) => [row.food, row.product.name])
        )

      // Nothing's on sale: the first in each list, and no crackers for garlic.
      expect(await check()).toMatchObject({ searched: 3, onSale: 0 })
      expect(await remembered()).toEqual({
        "chicken thigh": "Heritage Farm Chicken Thighs",
        onion: "Yellow Onion",
      })

      // Foster Farms goes on sale. Not looked at again until a week on.
      thighsOnSale = true
      expect(await check()).toMatchObject({ searched: 0, onSale: 0 })

      const weekAgo = addDays(localClock(new Date(), "UTC").date, -8)
      const [conn] = await t.db
        .select()
        .from(shopConnections)
        .where(eq(shopConnections.householdId, household.id))
      await t.db
        .update(shopConnections)
        .set({
          priceSearches: Object.fromEntries(
            Object.keys(conn!.priceSearches ?? {}).map((key) => [key, weekAgo])
          ),
        })
        .where(eq(shopConnections.householdId, household.id))
      // Thighs and onion get a fresh look (garlic waits a month); the AI
      // was told which is on sale and took it.
      expect(await check()).toMatchObject({ searched: 2, onSale: 1 })
      expect(asked.at(-1)).toContain(
        "Foster Farms Chicken Thighs (1 lb), on sale $1.99 (usually $2.99)"
      )
      expect((await remembered())["chicken thigh"]).toBe(
        "Foster Farms Chicken Thighs"
      )

      // Something someone chose stays, sale or not.
      await t.db
        .update(storeProducts)
        .set({
          product: {
            ...(await productOf(t, household.id, "onion")),
            name: "Sweet Onion",
          },
          chosen: true,
        })
        .where(
          and(
            eq(storeProducts.householdId, household.id),
            eq(storeProducts.food, "onion")
          )
        )
      await t.db
        .update(shopConnections)
        .set({
          priceSearches: {
            "chicken thigh": localClock(new Date(), "UTC").date,
            "garlic clove": localClock(new Date(), "UTC").date,
            onion: weekAgo,
          },
        })
        .where(eq(shopConnections.householdId, household.id))
      const before = asked.length
      await check()
      expect(asked.length).toBe(before)
    } finally {
      await t.close()
    }
  })
})

async function productOf(
  t: Awaited<ReturnType<typeof createTestAppWithAdmin>>,
  householdId: string,
  food: string
) {
  const [row] = await t.db
    .select()
    .from(storeProducts)
    .where(
      and(
        eq(storeProducts.householdId, householdId),
        eq(storeProducts.food, food)
      )
    )
  return row!.product
}
