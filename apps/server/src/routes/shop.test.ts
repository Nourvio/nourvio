import type {
  Basket,
  KrogerAppSettings,
  KrogerStore,
  ShopStatus,
} from "@mise/shared"
import { eq } from "drizzle-orm"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { shopConnections } from "../db/schema.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** A product as Kroger's API returns it. */
const kroger = (
  id: string,
  description: string,
  size: string,
  price: number,
  extra: { promo?: number; stock?: string; aisle?: string } = {}
) => ({
  productId: id,
  upc: id,
  description,
  brand: "Kroger",
  productPageURI: `/p/${id}?cid=x`,
  aisleLocations: extra.aisle
    ? [{ description: `Aisle ${extra.aisle}`, number: extra.aisle }]
    : [],
  images: [
    {
      perspective: "front",
      default: true,
      sizes: [
        {
          size: "medium",
          url: `https://www.kroger.com/product/images/medium/front/${id}`,
        },
      ],
    },
  ],
  items: [
    {
      size,
      price: { regular: price, promo: extra.promo ?? 0 },
      inventory: extra.stock ? { stockLevel: extra.stock } : undefined,
    },
  ],
})

const CATALOG = {
  thighsTreats: kroger(
    "0000000000001",
    "Chicken Thigh Dog Treats",
    "12 oz",
    9.99
  ),
  thighs: kroger(
    "0000000000002",
    "Boneless Skinless Chicken Thighs",
    "3 lb",
    8.97,
    {
      aisle: "40",
    }
  ),
  milk: kroger("0000000000003", "Kroger 2% Milk", "1 gal", 3.49, {
    promo: 2.99,
    aisle: "35",
  }),
  onion: kroger("0000000000004", "Yellow Onion", "1 each", 0.99, {
    aisle: "1",
  }),
  tomatoes: kroger("0000000000005", "Kroger Diced Tomatoes", "14.5 oz", 1.25, {
    aisle: "12",
  }),
  thighsOut: kroger("0000000000006", "Organic Chicken Thighs", "1.5 lb", 7.99, {
    stock: "TEMPORARILY_OUT_OF_STOCK",
  }),
}

const STORE = {
  locationId: "66000123",
  chain: "FRYS",
  name: "Fry's Food Stores - Tempe",
  address: {
    addressLine1: "1 Main St",
    city: "Tempe",
    state: "AZ",
    zipCode: "85281",
  },
}

type Call = { method: string; url: URL; body: string; auth: string }

describe("store connections: Kroger", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const calls: Call[] = []
  let prices = { milk: 3.49 }
  let refreshWorks = true
  let accessCount = 0

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })

  const krogerFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const body = String(init?.body ?? "")
    const auth = new Headers(init?.headers).get("authorization") ?? ""
    calls.push({ method: init?.method ?? "GET", url, body, auth })
    const path = url.pathname.replace("/v1", "")
    if (path === "/connect/oauth2/token") {
      const form = new URLSearchParams(body)
      if (
        auth !==
        `Basic ${Buffer.from("mise-app:shh-secret").toString("base64")}`
      ) {
        return json({ error: "invalid_client" }, 401)
      }
      if (form.get("grant_type") === "client_credentials") {
        return json({ access_token: "app-token", expires_in: 1800 })
      }
      if (form.get("grant_type") === "authorization_code") {
        return json({
          access_token: `user-token-${++accessCount}`,
          refresh_token: "refresh-1",
          expires_in: 1800,
        })
      }
      if (form.get("grant_type") === "refresh_token") {
        return refreshWorks
          ? json({
              access_token: `user-token-${++accessCount}`,
              refresh_token: "refresh-2",
              expires_in: 1800,
            })
          : json({ error: "invalid_grant" }, 400)
      }
    }
    if (path === "/locations") return json({ data: [STORE] })
    if (path === `/locations/${STORE.locationId}`) return json({ data: STORE })
    if (path === "/products") {
      const ids = url.searchParams.get("filter.productId")
      const all = Object.values(CATALOG).map((p) =>
        p.productId === CATALOG.milk.productId
          ? {
              ...p,
              items: [
                { ...p.items[0], price: { regular: prices.milk, promo: 0 } },
              ],
            }
          : p
      )
      if (ids)
        return json({
          data: all.filter((p) => ids.split(",").includes(p.productId)),
        })
      const term = url.searchParams.get("filter.term") ?? ""
      if (/thigh/.test(term)) {
        return json({
          data: [CATALOG.thighsTreats, CATALOG.thighsOut, CATALOG.thighs],
        })
      }
      if (/milk/.test(term)) return json({ data: [CATALOG.milk] })
      if (/onion/.test(term)) return json({ data: [CATALOG.onion] })
      if (/tomato/.test(term)) return json({ data: [CATALOG.tomatoes] })
      return json({ data: [] })
    }
    if (path === "/cart/add") {
      return auth.startsWith("Bearer user-token")
        ? new Response(null, { status: 204 })
        : json({ error: "unauthorized" }, 401)
    }
    return json({ error: "unexpected" }, 404)
  }

  const status = async () =>
    (await t.admin.get("/api/shop")).body.status as ShopStatus
  const basket = async () =>
    (await t.admin.get("/api/shop/kroger/basket")).body.basket as Basket
  const line = (b: Basket, name: string) =>
    b.lines.find((l) => l.name === name)!

  beforeAll(async () => {
    const photo = await sharp({
      create: { width: 500, height: 400, channels: 3, background: "#eee" },
    })
      .png()
      .toBuffer()
    const fetcher: Fetcher = async (url) => ({
      url,
      contentType: "image/png",
      body: photo,
    })
    t = await createTestAppWithAdmin({ krogerFetch, fetcher })
    for (const text of [
      "2 lb chicken thighs",
      "1 gallon milk",
      "3 onions",
      "2 cans diced tomatoes",
      "paper towels",
    ]) {
      await t.admin.post("/api/list/items", { text })
    }
  })
  afterAll(() => t.close())

  test("the server admin sets up the Kroger app", async () => {
    expect((await status()).kroger.ready).toBe(false)
    expect((await t.admin.get("/api/shop/kroger/basket")).status).toBe(400)

    const res = await t.admin.put("/api/shop/kroger/app", {
      clientId: "mise-app",
      clientSecret: "shh-secret",
    })
    expect(res.status).toBe(200)
    expect(res.body.app as KrogerAppSettings).toMatchObject({
      clientId: "mise-app",
      secretHint: "…cret",
      source: "settings",
      redirectUri: expect.stringMatching(/\/api\/shop\/kroger\/callback$/),
    })
    expect((await status()).kroger.ready).toBe(true)
  })

  test("the household picks its store by ZIP code", async () => {
    const found = await t.admin.get("/api/shop/kroger/locations?zip=85281")
    expect(found.body.stores as KrogerStore[]).toEqual([
      {
        locationId: "66000123",
        name: "Fry's Food Stores - Tempe",
        banner: "Fry's",
        address: "1 Main St, Tempe, AZ",
      },
    ])
    expect(
      (await t.admin.get("/api/shop/kroger/locations?zip=852")).status
    ).toBe(400)
    const res = await t.admin.put("/api/shop/kroger", {
      locationId: "66000123",
      modality: "PICKUP",
    })
    expect((res.body.status as ShopStatus).kroger.store?.banner).toBe("Fry's")
  })

  test("suggests a product for each item and works out how many to buy", async () => {
    const b = await basket()
    expect(b.storeName).toBe("Fry's")

    // No AI set up: the first in stock, so the out-of-stock thighs are passed over.
    const thighs = line(b, "chicken thighs")
    expect(thighs.product?.name).toBe("Chicken Thigh Dog Treats")
    expect(thighs.suggested).toBe(true)

    expect(line(b, "milk")).toMatchObject({
      product: {
        name: "Kroger 2% Milk",
        price: 3.49,
        salePrice: 2.99,
        aisle: "Aisle 35",
      },
      packages: 1,
      sure: true,
    })
    expect(line(b, "onions")).toMatchObject({ packages: 3, sure: true })
    expect(line(b, "diced tomatoes")).toMatchObject({ packages: 2, sure: true })
    expect(line(b, "paper towels")).toMatchObject({
      product: null,
      packages: 1,
    })
  })

  test("remembers products, with today's prices next time", async () => {
    prices = { milk: 3.79 }
    const searches = calls.filter((c) =>
      c.url.searchParams.has("filter.term")
    ).length
    const b = await basket()
    expect(line(b, "milk").product).toMatchObject({
      price: 3.79,
      salePrice: null,
    })
    // Only paper towels, which had nothing, is searched again.
    expect(
      calls.filter((c) => c.url.searchParams.has("filter.term")).length -
        searches
    ).toBe(1)
  })

  test("a product picked by hand is kept for that food", async () => {
    const found = await t.admin.get(
      "/api/shop/kroger/search?q=chicken%20thighs"
    )
    expect(found.body.products).toHaveLength(3)
    const b = await basket()
    const res = await t.admin.put(
      `/api/shop/kroger/products/${line(b, "chicken thighs").itemId}`,
      { productId: CATALOG.thighs.productId }
    )
    expect(res.body.line).toMatchObject({
      product: { name: "Boneless Skinless Chicken Thighs", size: "3 lb" },
      suggested: false,
      packages: 1,
      sure: true,
    })
    expect(line(await basket(), "chicken thighs").suggested).toBe(false)
  })

  test("sending needs a linked account", async () => {
    const b = await basket()
    const res = await t.admin.post("/api/shop/kroger/send", {
      lines: [{ itemId: line(b, "milk").itemId, packages: 1 }],
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Link the household's Kroger account/)
  })

  test("links the household's Kroger account through Kroger's sign-in", async () => {
    const res = await t.admin.post("/api/shop/kroger/link", {})
    const url = new URL(res.body.url)
    expect(url.origin + url.pathname).toBe(
      "https://api.kroger.com/v1/connect/oauth2/authorize"
    )
    expect(url.searchParams.get("client_id")).toBe("mise-app")
    expect(url.searchParams.get("scope")).toContain("cart.basic:write")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    const state = url.searchParams.get("state")!

    // Someone else can't finish it.
    const stranger = await t.admin.raw(
      `/api/shop/kroger/callback?code=nope&state=wrong`
    )
    expect(stranger.headers.get("location")).toMatch(/kroger=failed/)

    const back = await t.admin.raw(
      `/api/shop/kroger/callback?code=abc&state=${state}`
    )
    expect(back.status).toBe(302)
    expect(back.headers.get("location")).toBe(
      "/settings?kroger=linked#connections"
    )
    const exchange = calls.find((c) =>
      c.body.includes("grant_type=authorization_code")
    )!
    const form = new URLSearchParams(exchange.body)
    expect(form.get("code")).toBe("abc")
    expect(form.get("code_verifier")).toBeTruthy()
    expect((await status()).kroger.linked?.by).toBe("Kyle")

    // The tokens aren't stored as they are.
    const [row] = await t.db.select().from(shopConnections)
    expect(JSON.stringify(row!.account)).not.toContain("user-token-1")
  })

  test("sends the chosen lines to the cart, once", async () => {
    const b = await basket()
    const res = await t.admin.post("/api/shop/kroger/send", {
      lines: [
        { itemId: line(b, "chicken thighs").itemId, packages: 1 },
        { itemId: line(b, "milk").itemId, packages: 2 },
        { itemId: line(b, "diced tomatoes").itemId, packages: 2 },
        // Nothing to send for this one.
        { itemId: line(b, "paper towels").itemId, packages: 1 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      sent: 3,
      storeName: "Fry's",
      cartUrl: "https://www.frysfood.com/cart",
    })
    const add = calls.findLast((c) => c.url.pathname === "/v1/cart/add")!
    expect(add.method).toBe("PUT")
    expect(add.auth).toBe("Bearer user-token-1")
    expect(JSON.parse(add.body)).toEqual({
      items: [
        { upc: CATALOG.thighs.upc, quantity: 1, modality: "PICKUP" },
        { upc: CATALOG.milk.upc, quantity: 2, modality: "PICKUP" },
        { upc: CATALOG.tomatoes.upc, quantity: 2, modality: "PICKUP" },
      ],
    })

    const after = await basket()
    expect(after.sentAt).toBeTruthy()
    expect(line(after, "milk")).toMatchObject({ sent: true, suggested: false })
    expect(line(after, "onions").sent).toBe(false)
  })

  test("refreshes the sign-in when it runs out, and asks to link again when Kroger says no", async () => {
    const expire = async () => {
      const [row] = await t.db.select().from(shopConnections)
      await t.db
        .update(shopConnections)
        .set({ account: { ...row!.account!, expiresAt: Date.now() - 1000 } })
        .where(eq(shopConnections.householdId, row!.householdId))
    }
    const b = await basket()
    const send = () =>
      t.admin.post("/api/shop/kroger/send", {
        lines: [{ itemId: line(b, "onions").itemId, packages: 3 }],
      })

    await expire()
    expect((await send()).status).toBe(200)
    expect(calls.findLast((c) => c.url.pathname === "/v1/cart/add")!.auth).toBe(
      "Bearer user-token-2"
    )

    refreshWorks = false
    await expire()
    expect((await send()).status).toBe(409)
    expect((await status()).kroger).toMatchObject({
      linked: null,
      needsRelink: true,
    })
  })

  test("serves store photos, and only store photos", async () => {
    const photo = await t.admin.raw(
      `/api/shop/image?u=${encodeURIComponent("https://www.kroger.com/product/images/medium/front/1")}`
    )
    expect(photo.status).toBe(200)
    const { width, height } = await sharp(
      Buffer.from(await photo.arrayBuffer())
    ).metadata()
    expect([width, height]).toEqual([320, 320])
    expect(
      (
        await t.admin.raw(
          `/api/shop/image?u=${encodeURIComponent("https://evil.example/x.png")}`
        )
      ).status
    ).toBe(404)
  })

  test("only admins change the connection; only the server admin the app", async () => {
    const invite = await t.admin.post("/api/household/invites", {})
    const member = apiClient(t.app)
    const joined = await member.post(`/api/join/${invite.body.invite.token}`, {
      username: "sam",
      displayName: "Sam",
      password: "another long password",
    })
    expect(joined.status).toBe(201)
    expect(
      (await member.put("/api/shop/kroger", { modality: "DELIVERY" })).status
    ).toBe(403)
    expect((await member.post("/api/shop/kroger/link", {})).status).toBe(403)
    expect((await member.get("/api/shop/kroger/app")).status).toBe(403)
    // Anyone in the household can shop.
    expect((await member.get("/api/shop/kroger/basket")).status).toBe(200)
  })
})

describe("store connections: the AI's pick", () => {
  test("picks the real thing over the first search result", async () => {
    const asked: string[] = []
    const aiFactory: AiProviderFactory = (id) => ({
      id,
      async extract(request) {
        asked.push(
          request.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
        )
        return {
          data: { picks: [{ item: 0, choice: 2 }] },
          usage: { inputTokens: 300, outputTokens: 20 },
        } as never
      },
      async listModels() {
        return []
      },
    })
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      })
    const krogerFetch: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/token")) {
        return json({ access_token: "app", expires_in: 1800 })
      }
      if (url.pathname.endsWith(`/locations/${STORE.locationId}`)) {
        return json({ data: STORE })
      }
      return json({
        data: [CATALOG.thighsTreats, CATALOG.thighsOut, CATALOG.thighs],
      })
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
      await t.admin.post("/api/list/items", { text: "2 lb chicken thighs" })

      const b = (await t.admin.get("/api/shop/kroger/basket")).body
        .basket as Basket
      expect(b.lines[0]!.product?.name).toBe("Boneless Skinless Chicken Thighs")
      expect(asked[0]).toContain("Item 0: 2 lb chicken thighs")
      expect(asked[0]).toContain(
        "1. Organic Chicken Thighs (1.5 lb), $7.99, out of stock"
      )
    } finally {
      await t.close()
    }
  })
})

describe("store connections: Walmart, through the extension", () => {
  const walmart = (
    id: string,
    name: string,
    price: number,
    size: string | null,
    inStock = true
  ) => ({
    id,
    upc: null,
    name,
    brand: null,
    size,
    image: `https://i5.walmartimages.com/seo/${id}.jpeg`,
    price,
    salePrice: null,
    aisle: null,
    aisleNumber: null,
    inStock,
    url: `https://www.walmart.com/ip/${id}`,
  })

  test("keeps Mise's picks from the extension's searches, a hand pick over them, and what was sent", async () => {
    const t = await createTestAppWithAdmin()
    try {
      for (const text of [
        "1 gallon milk",
        "2 cans diced tomatoes",
        "paper towels",
      ]) {
        await t.admin.post("/api/list/items", { text })
      }
      const empty = (await t.admin.get("/api/shop/walmart/basket")).body
        .basket as Basket
      expect(empty.storeName).toBe("Walmart")
      expect(empty.lines.every((line) => line.product === null)).toBe(true)
      const id = (name: string) =>
        empty.lines.find((l) => l.name === name)!.itemId

      // No AI set up: the first in stock.
      const suggested = await t.admin.post("/api/shop/walmart/suggest", {
        items: [
          {
            itemId: id("milk"),
            products: [
              walmart("1", "Fancy Milk, 1 gal", 5.99, "1 gal", false),
              walmart(
                "2",
                "Great Value Whole Milk, Half Gallon, 64 fl oz",
                1.32,
                "64 fl oz"
              ),
            ],
          },
          {
            itemId: id("diced tomatoes"),
            products: [
              walmart(
                "3",
                "Great Value Diced Tomatoes, 14.5 oz",
                0.92,
                "14.5 oz"
              ),
            ],
          },
        ],
      })
      expect(suggested.status).toBe(200)
      const b = suggested.body.basket as Basket
      const milk = b.lines.find((l) => l.name === "milk")!
      expect(milk).toMatchObject({
        product: { id: "2", price: 1.32 },
        suggested: true,
        packages: 2,
        sure: true,
      })
      expect(b.lines.find((l) => l.name === "diced tomatoes")).toMatchObject({
        packages: 2,
      })

      const picked = await t.admin.put(
        `/api/shop/walmart/products/${id("milk")}`,
        {
          product: walmart(
            "4",
            "Great Value Whole Milk, 1 Gallon",
            2.48,
            "1 gal"
          ),
        }
      )
      expect(picked.body.line).toMatchObject({
        product: { id: "4" },
        suggested: false,
        packages: 1,
      })
      // Searching again doesn't undo a hand pick.
      await t.admin.post("/api/shop/walmart/suggest", {
        items: [
          {
            itemId: id("milk"),
            products: [walmart("2", "GV Milk", 1.32, "64 fl oz")],
          },
        ],
      })
      const again = (await t.admin.get("/api/shop/walmart/basket")).body
        .basket as Basket
      expect(again.lines.find((l) => l.name === "milk")!.product?.id).toBe("4")

      const sent = await t.admin.post("/api/shop/walmart/sent", {
        lines: [
          { itemId: id("milk"), packages: 1 },
          { itemId: id("diced tomatoes"), packages: 2 },
        ],
      })
      expect(sent.body).toEqual({ sent: 2 })
      const after = (await t.admin.get("/api/shop/walmart/basket")).body
        .basket as Basket
      expect(after.sentAt).toBeTruthy()
      expect(
        after.lines.find((l) => l.name === "diced tomatoes")
      ).toMatchObject({
        sent: true,
        suggested: false,
      })
      expect(after.lines.find((l) => l.name === "paper towels")!.sent).toBe(
        false
      )

      // Product details from a browser are checked.
      const bad = await t.admin.put(
        `/api/shop/walmart/products/${id("milk")}`,
        {
          product: {
            ...walmart("5", "Milk", 1, null),
            url: "javascript:alert(1)",
          },
        }
      )
      expect(bad.status).toBe(400)
    } finally {
      await t.close()
    }
  })
})
