import { createHash, randomBytes } from "node:crypto"

import {
  bakingDensity,
  formatAmount,
  packagesFor,
  parseProductSize,
  readPackAmount,
  UNITS,
  type Basket,
  type BasketLine,
  type KrogerAppSettings,
  type Need,
  type SendBasketInput,
  type ShopId,
  type ShopStatus,
  type StoreProduct,
} from "@mise/shared"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import {
  fdcFoods,
  foodMatches,
  settings,
  shopConnections,
  shoppingItems,
  storeProducts,
  type FdcPortion,
  type KrogerAccount,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { density, gramsFor, readAmount } from "../nutrition/grams.ts"
import { decryptSecret, encryptSecret } from "../secrets.ts"
import {
  bannerDomain,
  createKrogerClient,
  KrogerSignInError,
  type KrogerApp,
  type KrogerClient,
} from "../shop/kroger.ts"
import { foodOf, listRows, listRowsForStore, toItem } from "./list.ts"

type ItemRow = typeof shoppingItems.$inferSelect
type ConnectionRow = typeof shopConnections.$inferSelect

const SETTINGS_KEY = "shop"
/** Stored in the settings table; the secret encrypted. */
type StoredShopSettings = {
  kroger?: { clientId?: string; clientSecret?: string }
}

const UNIT_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]))
/** Counted as whole things to buy: "2 onions", "1 head lettuce", "2 cans". */
const WHOLE_UNITS = new Set(["head", "bunch", "can", "jar", "package"])
const CONTAINER_UNITS = new Set(["can", "jar", "package"])
/** A whole one, in USDA's portion names: "1 medium", "1 large", "1 fruit". */
const WHOLE_PORTION =
  /\b(medium|large|small|whole|each|fruit|head|bulb|ear|breast|thigh)\b/i
const PART_PORTION =
  /\b(clove|slice|sprig|leaf|leaves|cup|tbsp|tsp|tablespoon|teaspoon|oz|piece|chopped|diced)\b/i

const STORE_NAMES: Record<ShopId, string> = {
  kroger: "Kroger",
  costco: "Costco",
  walmart: "Walmart",
}

/** A sign-in started and not finished yet, by its state. Lost on restart; just try again. */
type PendingLink = {
  householdId: string
  userId: string
  userName: string
  verifier: string
  redirectUri: string
  expires: number
}

const PICK_SYSTEM = `You choose grocery products for a home cook's shopping list. For each list item you get the store's search results; pick the one a typical shopper would buy to cook with.
- The plain, everyday version of the thing itself: fresh chicken thighs, not pet food, a frozen meal or a seasoning named after it.
- A sensible size for the amount needed.
- In stock over out of stock. The store's own brand when otherwise equal.
- null when none of the results is the item.`

const picksSchema = z.object({
  picks: z.array(z.object({ item: z.number(), choice: z.number().nullable() })),
})

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await fn(items[index]!)
      }
    })
  )
  return results
}

function hint(secret: string) {
  return `…${secret.slice(-4)}`
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

/** What one whole one weighs, from USDA portions ("1 medium" onion), else what it was found to weigh. */
function wholeGrams(portions: FdcPortion[], known: Record<string, number>) {
  const portion = portions.find(
    (p) => WHOLE_PORTION.test(p.label) && !PART_PORTION.test(p.label)
  )
  return portion ? portion.grams / portion.amount : (known.each ?? null)
}

/** How much of each row is needed, every way it can be measured. */
async function needsFor(db: Db, rows: ItemRow[]) {
  const amounts = rows.map((row) =>
    row.quantity === null
      ? null
      : readAmount(
          `${formatAmount(row.quantity, row.unitId)} ${row.name}`.trim()
        )
  )
  const keys = [...new Set(amounts.flatMap((a) => (a ? [a.key] : [])))]
  const learned = keys.length
    ? await db
        .select({
          food: foodMatches.food,
          grams: foodMatches.grams,
          portions: fdcFoods.portions,
        })
        .from(foodMatches)
        .leftJoin(fdcFoods, eq(foodMatches.fdcId, fdcFoods.fdcId))
        .where(inArray(foodMatches.food, keys))
    : []
  const byFood = new Map(learned.map((row) => [row.food, row]))

  return rows.map((row, index): Need => {
    // Packs and containers, as every-week items say: "2 × 12-pack".
    const pack = row.amountText ? readPackAmount(row.amountText) : null
    if (pack) {
      return {
        ...pack,
        grams: null,
        ml: null,
        eachGrams: null,
        containers: true,
      }
    }
    const amount = amounts[index]
    if (!amount || row.quantity === null) {
      return { count: null, grams: null, ml: null, eachGrams: null }
    }
    const found = byFood.get(amount.key)
    const portions = found?.portions ?? []
    const known = found?.grams ?? {}
    const unit = row.unitId ? UNIT_BY_ID.get(row.unitId) : undefined
    const grams = gramsFor(amount, portions, known)
    const perMl = bakingDensity(amount.name) ?? density(portions)
    return {
      count: !unit || WHOLE_UNITS.has(unit.id) ? row.quantity : null,
      grams,
      ml:
        unit?.kind === "volume"
          ? row.quantity * unit.toBase!
          : grams && perMl
            ? grams / perMl
            : null,
      eachGrams: wholeGrams(portions, known),
      containers: unit ? CONTAINER_UNITS.has(unit.id) : false,
    }
  })
}

export type ShopService = ReturnType<typeof createShopService>

/**
 * Store connections: the server's Kroger app, each household's store and
 * linked account, the products it buys, and sending the list to the cart.
 */
export function createShopService(
  db: Db,
  ai: AiService,
  options: { krogerFetch?: typeof fetch } = {}
) {
  const pending = new Map<string, PendingLink>()
  let cached: { signature: string; client: KrogerClient } | null = null

  async function loadSettings(): Promise<StoredShopSettings> {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
    return (row?.value as StoredShopSettings | undefined) ?? {}
  }

  /** The server's Kroger app. Environment variables win over Settings. */
  async function krogerApp(): Promise<
    (KrogerApp & { source: "env" | "settings" }) | null
  > {
    const clientId = process.env.KROGER_CLIENT_ID?.trim()
    const clientSecret = process.env.KROGER_CLIENT_SECRET?.trim()
    if (clientId && clientSecret)
      return { clientId, clientSecret, source: "env" }
    const saved = (await loadSettings()).kroger
    const secret = saved?.clientSecret
      ? decryptSecret(saved.clientSecret)
      : null
    return saved?.clientId && secret
      ? { clientId: saved.clientId, clientSecret: secret, source: "settings" }
      : null
  }

  async function kroger() {
    const app = await krogerApp()
    if (!app) {
      throw new HttpError(
        400,
        "Kroger isn't set up on this server yet. The server admin can add it in Settings → Kroger."
      )
    }
    const signature = `${app.clientId}:${app.clientSecret}`
    if (cached?.signature !== signature) {
      cached = {
        signature,
        client: createKrogerClient(app, options.krogerFetch),
      }
    }
    return cached.client
  }

  async function krogerAppSettings(
    redirectUri: string
  ): Promise<KrogerAppSettings> {
    const app = await krogerApp()
    const saved = (await loadSettings()).kroger
    return {
      clientId: app?.clientId ?? saved?.clientId ?? null,
      secretHint: app ? hint(app.clientSecret) : null,
      source: app?.source ?? null,
      redirectUri,
    }
  }

  async function saveKrogerApp(input: {
    clientId: string | null
    clientSecret?: string | null
  }) {
    const stored = await loadSettings()
    const kroger = { ...stored.kroger }
    if (input.clientId === null) {
      delete kroger.clientId
      delete kroger.clientSecret
    } else {
      kroger.clientId = input.clientId
      if (input.clientSecret)
        kroger.clientSecret = encryptSecret(input.clientSecret)
    }
    const value = { ...stored, kroger }
    await db
      .insert(settings)
      .values({ key: SETTINGS_KEY, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
    cached = null
  }

  async function connection(householdId: string, shop: ShopId = "kroger") {
    const [row] = await db
      .select()
      .from(shopConnections)
      .where(
        and(
          eq(shopConnections.householdId, householdId),
          eq(shopConnections.shop, shop)
        )
      )
    return row
  }

  async function saveConnection(
    householdId: string,
    patch: Partial<Omit<ConnectionRow, "householdId" | "shop">>,
    shop: ShopId = "kroger"
  ) {
    await db
      .insert(shopConnections)
      .values({ householdId, shop, ...patch })
      .onConflictDoUpdate({
        target: [shopConnections.householdId, shopConnections.shop],
        set: patch,
      })
  }

  async function status(householdId: string): Promise<ShopStatus> {
    const row = await connection(householdId)
    return {
      kroger: {
        ready: Boolean(await krogerApp()),
        store: row?.store ?? null,
        modality: row?.modality ?? "PICKUP",
        linked:
          row?.account && !row.account.broken
            ? { by: row.account.linkedBy, at: row.account.linkedAt }
            : null,
        needsRelink: Boolean(row?.account?.broken),
      },
    }
  }

  async function locations(zip: string) {
    if (!/^\d{5}$/.test(zip))
      throw new HttpError(400, "Type a 5-digit ZIP code")
    return (await kroger()).locations(zip)
  }

  async function saveKrogerSettings(
    householdId: string,
    input: { locationId?: string; modality?: "PICKUP" | "DELIVERY" }
  ) {
    const patch: Partial<ConnectionRow> = {}
    if (input.locationId) {
      const store = await (await kroger()).location(input.locationId)
      if (!store) throw new HttpError(404, "Kroger doesn't know that store")
      patch.store = store
    }
    if (input.modality) patch.modality = input.modality
    if (Object.keys(patch).length) await saveConnection(householdId, patch)
    return status(householdId)
  }

  /** Starts linking a Kroger account: where to send the person to sign in. */
  async function startLink(
    householdId: string,
    user: { id: string; displayName: string },
    redirectUri: string
  ) {
    const client = await kroger()
    for (const [state, link] of pending) {
      if (link.expires < Date.now()) pending.delete(state)
    }
    const state = randomBytes(24).toString("base64url")
    const { verifier, challenge } = pkce()
    pending.set(state, {
      householdId,
      userId: user.id,
      userName: user.displayName,
      verifier,
      redirectUri,
      expires: Date.now() + 10 * 60_000,
    })
    return client.authorizeUrl({ redirectUri, state, codeChallenge: challenge })
  }

  /** Kroger sent the person back: trade the code for tokens and keep them. */
  async function finishLink(state: string, code: string, userId: string) {
    const link = pending.get(state)
    pending.delete(state)
    if (!link || link.expires < Date.now() || link.userId !== userId) {
      throw new HttpError(
        400,
        "That sign-in took too long or didn't match. Try linking again."
      )
    }
    const tokens = await (
      await kroger()
    ).exchangeCode(code, link.verifier, link.redirectUri)
    const account: KrogerAccount = {
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      linkedBy: link.userName,
      linkedAt: new Date().toISOString(),
    }
    await saveConnection(link.householdId, { account })
    return link.householdId
  }

  async function unlink(householdId: string) {
    await saveConnection(householdId, { account: null })
    return status(householdId)
  }

  /** A working access token for the household's Kroger account, refreshed when it's about to run out. */
  async function userToken(householdId: string, row: ConnectionRow) {
    const account = row.account
    if (!account || account.broken) {
      throw new HttpError(
        409,
        "Link the household's Kroger account first (Settings → Stores)."
      )
    }
    const access = decryptSecret(account.accessToken)
    if (access && account.expiresAt > Date.now() + 60_000) return access
    const refresh = decryptSecret(account.refreshToken)
    try {
      if (!refresh) throw new KrogerSignInError()
      const tokens = await (await kroger()).refresh(refresh)
      await saveConnection(householdId, {
        account: {
          ...account,
          accessToken: encryptSecret(tokens.accessToken),
          refreshToken: encryptSecret(tokens.refreshToken),
          expiresAt: tokens.expiresAt,
        },
      })
      return tokens.accessToken
    } catch (error) {
      if (error instanceof KrogerSignInError) {
        await saveConnection(householdId, {
          account: { ...account, broken: true },
        })
      }
      throw error
    }
  }

  async function requireStore(householdId: string) {
    const row = await connection(householdId)
    if (!row?.store) {
      throw new HttpError(
        400,
        "Pick the household's store first (Settings → Stores)."
      )
    }
    return { row, store: row.store }
  }

  /** Mise's pick from each item's search results: the AI's when it's set up, else the first in stock. */
  async function choose(
    actor: AiActor,
    items: ItemRow[],
    results: StoreProduct[][]
  ): Promise<(StoreProduct | null)[]> {
    const fallback = results.map(
      (list) => list.find((p) => p.inStock !== false) ?? list[0] ?? null
    )
    const asked = items.flatMap((_, index) =>
      results[index]!.length > 1 ? [index] : []
    )
    if (!asked.length || !(await ai.status()).available) return fallback
    try {
      const text = asked
        .map((index, n) => {
          const item = items[index]!
          const options = results[index]!.map(
            (p, i) =>
              `  ${i}. ${p.name}${p.size ? ` (${p.size})` : ""}${p.price ? `, $${p.price}` : ""}${p.inStock === false ? ", out of stock" : ""}`
          ).join("\n")
          return (
            `Item ${n}: ${toItem(item).amount} ${item.name}`.replace(
              /\s+/g,
              " "
            ) + `\n${options}`
          )
        })
        .join("\n\n")
      const { picks } = await ai.extract("shopping", actor, {
        system: PICK_SYSTEM,
        parts: [{ type: "text", text }],
        schema: picksSchema,
        schemaName: "product_picks",
      })
      const chosen: (StoreProduct | null)[] = [...fallback]
      for (const pick of picks) {
        const index = asked[pick.item]
        if (index === undefined) continue
        const list = results[index]!
        chosen[index] =
          pick.choice === null
            ? null
            : (list[pick.choice] ?? chosen[index] ?? null)
      }
      return chosen
    } catch {
      return fallback
    }
  }

  function toLine(
    row: ItemRow,
    need: Need,
    saved: { product: StoreProduct; chosen: boolean } | undefined,
    sent: Record<string, number>
  ): BasketLine {
    const product = saved?.product ?? null
    const { packages, sure } = packagesFor(
      need,
      parseProductSize(product?.size ?? null)
    )
    return {
      itemId: row.id,
      name: row.name,
      amount: toItem(row).amount,
      product,
      suggested: Boolean(saved && !saved.chosen),
      packages,
      sure,
      sent: row.id in sent,
    }
  }

  /**
   * The list ready for the store: each unchecked item with its product
   * (today's price), or Mise's suggestion for one, and how many to buy.
   */
  async function basket(householdId: string, actor: AiActor): Promise<Basket> {
    const { row: conn, store } = await requireStore(householdId)
    const client = await kroger()
    const rows = (await listRowsForStore(db, householdId, "kroger")).filter(
      (row) => !row.checked
    )
    const savedRows = await db
      .select()
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.householdId, householdId),
          eq(storeProducts.shop, "kroger")
        )
      )
    const saved = new Map(savedRows.map((row) => [row.food, row]))
    const foods = [...new Set(rows.map((row) => foodOf(row.key)))]

    // Today's prices and stock for what's remembered.
    const known = foods.flatMap((food) => {
      const row = saved.get(food)
      return row ? [row] : []
    })
    if (known.length) {
      const fresh = new Map(
        (
          await client.products(
            known.map((row) => row.product.id),
            store
          )
        ).map((product) => [product.id, product])
      )
      for (const row of known) {
        const product = fresh.get(row.product.id)
        if (!product) continue
        row.product = product
        await db
          .update(storeProducts)
          .set({ product })
          .where(
            and(
              eq(storeProducts.householdId, householdId),
              eq(storeProducts.shop, "kroger"),
              eq(storeProducts.food, row.food)
            )
          )
      }
    }

    // Suggestions for what isn't.
    const missing = foods.flatMap((food) => {
      if (saved.has(food)) return []
      const row = rows.find((item) => foodOf(item.key) === food)!
      return [row]
    })
    if (missing.length) {
      const results = await mapLimit(missing, 4, (row) =>
        client.search(row.name, store, 8).catch(() => [] as StoreProduct[])
      )
      const picks = await choose(actor, missing, results)
      const values = missing.flatMap((row, index) => {
        const product = picks[index]
        return product
          ? [
              {
                householdId,
                shop: "kroger" as const,
                food: foodOf(row.key),
                product,
              },
            ]
          : []
      })
      if (values.length) {
        const inserted = await db
          .insert(storeProducts)
          .values(values)
          .onConflictDoNothing()
          .returning()
        for (const row of inserted) saved.set(row.food, row)
      }
    }

    const needs = await needsFor(db, rows)
    const sent = conn.lastSent?.items ?? {}
    return {
      shop: "kroger",
      storeName: store.banner,
      lines: rows.map((row, index) =>
        toLine(row, needs[index]!, saved.get(foodOf(row.key)), sent)
      ),
      sentAt: conn.lastSent?.at ?? null,
    }
  }

  async function search(householdId: string, query: string) {
    const { store } = await requireStore(householdId)
    return (await kroger()).search(query, store, 20)
  }

  async function findRow(householdId: string, itemId: string) {
    const [row] = z.uuid().safeParse(itemId).success
      ? await db
          .select()
          .from(shoppingItems)
          .where(
            and(
              eq(shoppingItems.id, itemId),
              eq(shoppingItems.householdId, householdId)
            )
          )
      : []
    if (!row) throw new HttpError(404, "That item isn't on the list")
    return row
  }

  /** Remembers a product for an item's food, from now on. */
  async function pick(householdId: string, itemId: string, productId: string) {
    const { row: conn, store } = await requireStore(householdId)
    const row = await findRow(householdId, itemId)
    const [product] = await (await kroger()).products([productId], store)
    if (!product) throw new HttpError(404, "Kroger doesn't have that product")
    const food = foodOf(row.key)
    await db
      .insert(storeProducts)
      .values({ householdId, shop: "kroger", food, product, chosen: true })
      .onConflictDoUpdate({
        target: [
          storeProducts.householdId,
          storeProducts.shop,
          storeProducts.food,
        ],
        set: { product, chosen: true },
      })
    const [need] = await needsFor(db, [row])
    return toLine(
      row,
      need!,
      { product, chosen: true },
      conn.lastSent?.items ?? {}
    )
  }

  /** Adds the chosen lines to the household's Kroger cart. */
  async function send(householdId: string, input: SendBasketInput) {
    const { row: conn, store } = await requireStore(householdId)
    const token = await userToken(householdId, conn)
    const ids = input.lines.map((line) => line.itemId)
    const rows = await db
      .select()
      .from(shoppingItems)
      .where(
        and(
          eq(shoppingItems.householdId, householdId),
          inArray(shoppingItems.id, ids)
        )
      )
    const byId = new Map(rows.map((row) => [row.id, row]))
    const foods = rows.map((row) => foodOf(row.key))
    const products = foods.length
      ? await db
          .select()
          .from(storeProducts)
          .where(
            and(
              eq(storeProducts.householdId, householdId),
              eq(storeProducts.shop, "kroger"),
              inArray(storeProducts.food, foods)
            )
          )
      : []
    const byFood = new Map(products.map((row) => [row.food, row]))

    const quantities = new Map<string, number>()
    const sentItems: Record<string, number> = {}
    for (const line of input.lines) {
      const row = byId.get(line.itemId)
      const upc = row ? byFood.get(foodOf(row.key))?.product.upc : null
      if (!row || !upc) continue
      quantities.set(upc, (quantities.get(upc) ?? 0) + line.packages)
      sentItems[row.id] = line.packages
    }
    if (!quantities.size) {
      throw new HttpError(400, "Pick a product for something first")
    }
    await (
      await kroger()
    ).addToCart(
      token,
      [...quantities].map(([upc, quantity]) => ({ upc, quantity })),
      conn.modality
    )

    await rememberSent(householdId, "kroger", sentItems, rows)
    return {
      sent: Object.keys(sentItems).length,
      storeName: store.banner,
      cartUrl: `https://www.${bannerDomain(store)}/cart`,
    }
  }

  /**
   * What was sent was looked over: remember those products for good, and
   * what went, so it's left out next time.
   */
  async function rememberSent(
    householdId: string,
    shop: ShopId,
    sentItems: Record<string, number>,
    rows: ItemRow[]
  ) {
    const byId = new Map(rows.map((row) => [row.id, row]))
    const foods = [
      ...new Set(Object.keys(sentItems).map((id) => foodOf(byId.get(id)!.key))),
    ]
    if (foods.length) {
      await db
        .update(storeProducts)
        .set({ chosen: true })
        .where(
          and(
            eq(storeProducts.householdId, householdId),
            eq(storeProducts.shop, shop),
            inArray(storeProducts.food, foods)
          )
        )
    }
    const conn = await connection(householdId, shop)
    const stillListed = new Set(
      (await listRows(db, householdId)).map((row) => row.id)
    )
    const previous = Object.fromEntries(
      Object.entries(conn?.lastSent?.items ?? {}).filter(([id]) =>
        stillListed.has(id)
      )
    )
    await saveConnection(
      householdId,
      {
        lastSent: {
          at: new Date().toISOString(),
          items: { ...previous, ...sentItems },
        },
      },
      shop
    )
  }

  async function savedProducts(householdId: string, shop: ShopId) {
    const rows = await db
      .select()
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.householdId, householdId),
          eq(storeProducts.shop, shop)
        )
      )
    return new Map(rows.map((row) => [row.food, row]))
  }

  async function rowsById(householdId: string, ids: string[]) {
    const rows = ids.length
      ? await db
          .select()
          .from(shoppingItems)
          .where(
            and(
              eq(shoppingItems.householdId, householdId),
              inArray(shoppingItems.id, ids)
            )
          )
      : []
    return new Map(rows.map((row) => [row.id, row]))
  }

  /**
   * The list for a store Mise can't reach itself (Walmart, through the
   * browser extension): remembered products, how many, and what was sent.
   */
  async function storeBasket(
    householdId: string,
    shop: ShopId
  ): Promise<Basket> {
    const rows = (await listRowsForStore(db, householdId, shop)).filter(
      (row) => !row.checked
    )
    const saved = await savedProducts(householdId, shop)
    const needs = await needsFor(db, rows)
    const conn = await connection(householdId, shop)
    const sent = conn?.lastSent?.items ?? {}
    return {
      shop,
      storeName: STORE_NAMES[shop],
      lines: rows.map((row, index) =>
        toLine(row, needs[index]!, saved.get(foodOf(row.key)), sent)
      ),
      sentAt: conn?.lastSent?.at ?? null,
    }
  }

  /** Mise's picks from the search results the extension found, kept as suggestions. */
  async function suggest(
    householdId: string,
    actor: AiActor,
    shop: ShopId,
    input: { items: { itemId: string; products: StoreProduct[] }[] }
  ) {
    const byId = await rowsById(
      householdId,
      input.items.map((item) => item.itemId)
    )
    const asked = input.items.filter(
      (item) => byId.has(item.itemId) && item.products.length
    )
    const rows = asked.map((item) => byId.get(item.itemId)!)
    const picks = await choose(
      actor,
      rows,
      asked.map((item) => item.products)
    )
    const values = rows.flatMap((row, index) => {
      const product = picks[index]
      return product
        ? [{ householdId, shop, food: foodOf(row.key), product }]
        : []
    })
    // A product someone chose stays; only fill in what's missing.
    if (values.length) {
      await db.insert(storeProducts).values(values).onConflictDoNothing()
    }
    return storeBasket(householdId, shop)
  }

  /** A product picked by hand (on the store's site) for an item's food, from now on. */
  async function saveProduct(
    householdId: string,
    shop: ShopId,
    itemId: string,
    product: StoreProduct
  ) {
    const row = await findRow(householdId, itemId)
    const food = foodOf(row.key)
    await db
      .insert(storeProducts)
      .values({ householdId, shop, food, product, chosen: true })
      .onConflictDoUpdate({
        target: [
          storeProducts.householdId,
          storeProducts.shop,
          storeProducts.food,
        ],
        set: { product, chosen: true },
      })
    const [need] = await needsFor(db, [row])
    const conn = await connection(householdId, shop)
    return toLine(
      row,
      need!,
      { product, chosen: true },
      conn?.lastSent?.items ?? {}
    )
  }

  /** The extension added these to the store's cart: remember them. */
  async function recordSent(
    householdId: string,
    shop: ShopId,
    input: SendBasketInput
  ) {
    const byId = await rowsById(
      householdId,
      input.lines.map((line) => line.itemId)
    )
    const sentItems = Object.fromEntries(
      input.lines
        .filter((line) => byId.has(line.itemId))
        .map((line) => [line.itemId, line.packages])
    )
    await rememberSent(householdId, shop, sentItems, [...byId.values()])
    return { sent: Object.keys(sentItems).length }
  }

  /** Aisles of what's remembered, by food, for walking the store in order. */
  async function aisles(householdId: string) {
    const rows = await db
      .select({ food: storeProducts.food, product: storeProducts.product })
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.householdId, householdId),
          eq(storeProducts.shop, "kroger")
        )
      )
    return new Map(rows.map((row) => [row.food, row.product]))
  }

  return {
    krogerAppSettings,
    saveKrogerApp,
    status,
    locations,
    saveKrogerSettings,
    startLink,
    finishLink,
    unlink,
    basket,
    search,
    pick,
    send,
    aisles,
    storeBasket,
    suggest,
    saveProduct,
    recordSent,
  }
}
