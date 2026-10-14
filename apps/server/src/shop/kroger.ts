import type { KrogerModality, KrogerStore, StoreProduct } from "@mise/shared"

import { HttpError } from "../http.ts"

/** Kroger's API; KROGER_API_URL points elsewhere (Kroger's certification environment, say). */
export function krogerApi() {
  return (
    process.env.KROGER_API_URL?.trim().replace(/\/$/, "") ||
    "https://api.kroger.com/v1"
  )
}

/** What a person grants Mise when they link their account. */
const USER_SCOPES = "cart.basic:write profile.compact product.compact"

export type KrogerApp = { clientId: string; clientSecret: string }

export type KrogerTokens = {
  accessToken: string
  refreshToken: string
  /** Milliseconds since the epoch. */
  expiresAt: number
}

/** Kroger's chains, by the code its API uses: their names and websites. */
const BANNERS: Record<string, { name: string; domain: string }> = {
  KROGER: { name: "Kroger", domain: "kroger.com" },
  FRYS: { name: "Fry's", domain: "frysfood.com" },
  RALPHS: { name: "Ralphs", domain: "ralphs.com" },
  KINGSOOPERS: { name: "King Soopers", domain: "kingsoopers.com" },
  SMITHS: { name: "Smith's", domain: "smithsfoodanddrug.com" },
  FREDMEYER: { name: "Fred Meyer", domain: "fredmeyer.com" },
  QFC: { name: "QFC", domain: "qfc.com" },
  HARRISTEETER: { name: "Harris Teeter", domain: "harristeeter.com" },
  DILLONS: { name: "Dillons", domain: "dillons.com" },
  MARIANOS: { name: "Mariano's", domain: "marianos.com" },
  PICKNSAVE: { name: "Pick 'n Save", domain: "picknsave.com" },
  CITYMARKET: { name: "City Market", domain: "citymarket.com" },
  BAKERS: { name: "Baker's", domain: "bakersplus.com" },
  GERBES: { name: "Gerbes", domain: "gerbes.com" },
  JAYC: { name: "Jay C", domain: "jaycfoods.com" },
  PAYLESS: { name: "Pay Less", domain: "pay-less.com" },
  METROMARKET: { name: "Metro Market", domain: "metromarket.net" },
  FOODSCO: { name: "Foods Co", domain: "foodsco.net" },
  FOOD4LESS: { name: "Food 4 Less", domain: "food4less.com" },
  RULER: { name: "Ruler", domain: "rulerfoods.com" },
}

function bannerOf(chain: string | undefined, locationName: string) {
  const code = (chain ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  return (
    BANNERS[code] ?? {
      name: locationName.split(" - ")[0]?.trim() || "Kroger",
      domain: "kroger.com",
    }
  )
}

/** The website of a store's chain, for links to products and the cart. */
export function bannerDomain(store: KrogerStore) {
  return (
    Object.values(BANNERS).find((banner) => banner.name === store.banner)
      ?.domain ?? "kroger.com"
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Kroger's JSON, read defensively */

function toStore(raw: any): KrogerStore {
  const name = String(raw.name ?? "Store")
  const address = raw.address ?? {}
  return {
    locationId: String(raw.locationId),
    name,
    banner: bannerOf(raw.chain, name).name,
    address: [address.addressLine1, address.city, address.state]
      .filter(Boolean)
      .join(", "),
  }
}

function money(value: unknown) {
  return typeof value === "number" && value > 0
    ? Math.round(value * 100) / 100
    : null
}

/** A Kroger product as Mise keeps it, with the given store's price and aisle. */
export function toProduct(raw: any, domain = "kroger.com"): StoreProduct {
  const item = raw.items?.[0] ?? {}
  const images: any[] = raw.images ?? []
  const image =
    images.find(
      (i) => i.perspective === "front" && (i.default || i.featured)
    ) ??
    images.find((i) => i.perspective === "front") ??
    images[0]
  const sizes: any[] = image?.sizes ?? []
  const photo =
    sizes.find((s) => s.size === "medium") ??
    sizes.find((s) => s.size === "large") ??
    sizes[0]
  const regular = money(item.price?.regular)
  const promo = money(item.price?.promo)
  const aisle = raw.aisleLocations?.[0]
  const aisleNumber = Number(aisle?.number)
  const stock = item.inventory?.stockLevel
  return {
    id: String(raw.productId),
    upc: raw.upc ? String(raw.upc) : null,
    name: String(raw.description ?? "Product").trim(),
    brand: raw.brand ? String(raw.brand) : null,
    size: item.size ? String(item.size) : null,
    image: typeof photo?.url === "string" ? photo.url : null,
    price: regular,
    salePrice: promo && regular && promo < regular ? promo : null,
    aisle: aisle?.description ? String(aisle.description) : null,
    aisleNumber:
      Number.isFinite(aisleNumber) && aisleNumber > 0 ? aisleNumber : null,
    inStock: stock ? stock !== "TEMPORARILY_OUT_OF_STOCK" : null,
    url: raw.productPageURI
      ? `https://www.${domain}${String(raw.productPageURI).split("?")[0]}`
      : null,
  }
}

/** Kroger's search wants at least 3 characters and at most 8 words. */
function searchTerm(text: string) {
  const words = text
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  const term = words.join(" ")
  return term.length >= 3 ? term : null
}

/**
 * Kroger's public APIs: stores, products with a store's prices and aisles,
 * signing a shopper in, and adding to their cart. `fetchImpl` is swapped for
 * a fake in tests.
 */
export function createKrogerClient(
  app: KrogerApp,
  fetchImpl: typeof fetch = fetch
) {
  let appToken: { token: string; expiresAt: number } | null = null

  async function tokenRequest(form: Record<string, string>) {
    const res = await fetchImpl(`${krogerApi()}/connect/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams(form).toString(),
    })
    const body = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      if (res.status === 401 || body.error === "invalid_client") {
        throw new HttpError(
          400,
          "Kroger didn't accept the app's client ID and secret. Check them in Settings → Kroger."
        )
      }
      if (
        form.grant_type === "refresh_token" ||
        body.error === "invalid_grant"
      ) {
        throw new KrogerSignInError()
      }
      throw new HttpError(502, "Kroger's sign-in didn't work just now")
    }
    return body as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
  }

  async function appAccess() {
    if (appToken && appToken.expiresAt > Date.now() + 60_000) {
      return appToken.token
    }
    const body = await tokenRequest({
      grant_type: "client_credentials",
      scope: "product.compact",
    })
    appToken = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 1800) * 1000,
    }
    return appToken.token
  }

  async function call(
    path: string,
    options: { token: string; method?: string; body?: unknown }
  ) {
    const res = await fetchImpl(`${krogerApi()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.token}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    if (res.status === 429) {
      throw new HttpError(
        429,
        "Kroger's daily limit for this app is used up. Try again tomorrow."
      )
    }
    if (res.status === 401) throw new KrogerSignInError()
    if (!res.ok) {
      throw new HttpError(
        502,
        "Kroger didn't answer just now. Try again in a minute."
      )
    }
    return res.status === 204 ? null : ((await res.json()) as any)
  }

  const tokens = (
    body: Awaited<ReturnType<typeof tokenRequest>>,
    previous?: string
  ): KrogerTokens => ({
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previous ?? "",
    expiresAt: Date.now() + (body.expires_in ?? 1800) * 1000,
  })

  return {
    authorizeUrl(options: {
      redirectUri: string
      state: string
      codeChallenge: string
    }) {
      const params = new URLSearchParams({
        scope: USER_SCOPES,
        response_type: "code",
        client_id: app.clientId,
        redirect_uri: options.redirectUri,
        state: options.state,
        code_challenge: options.codeChallenge,
        code_challenge_method: "S256",
      })
      return `${krogerApi()}/connect/oauth2/authorize?${params}`
    },

    async exchangeCode(code: string, verifier: string, redirectUri: string) {
      return tokens(
        await tokenRequest({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        })
      )
    },

    async refresh(refreshToken: string) {
      return tokens(
        await tokenRequest({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        refreshToken
      )
    },

    /** Stores near a ZIP code. */
    async locations(zip: string) {
      const params = new URLSearchParams({
        "filter.zipCode.near": zip,
        "filter.limit": "12",
      })
      const body = await call(`/locations?${params}`, {
        token: await appAccess(),
      })
      return ((body?.data ?? []) as any[]).map(toStore)
    },

    async location(locationId: string) {
      const body = await call(`/locations/${encodeURIComponent(locationId)}`, {
        token: await appAccess(),
      })
      return body?.data ? toStore(body.data) : null
    },

    /** Products for a search, with the store's prices and aisles. */
    async search(text: string, store: KrogerStore, limit = 10) {
      const term = searchTerm(text)
      if (!term) return []
      const params = new URLSearchParams({
        "filter.term": term,
        "filter.locationId": store.locationId,
        "filter.limit": String(limit),
      })
      const body = await call(`/products?${params}`, {
        token: await appAccess(),
      })
      const domain = bannerDomain(store)
      return ((body?.data ?? []) as any[]).map((raw) => toProduct(raw, domain))
    },

    /** Products by id, with today's prices at the store (50 at a time). */
    async products(ids: string[], store: KrogerStore) {
      const domain = bannerDomain(store)
      const found: StoreProduct[] = []
      for (let i = 0; i < ids.length; i += 50) {
        const params = new URLSearchParams({
          "filter.productId": ids.slice(i, i + 50).join(","),
          "filter.locationId": store.locationId,
          "filter.limit": "50",
        })
        const body = await call(`/products?${params}`, {
          token: await appAccess(),
        })
        found.push(
          ...((body?.data ?? []) as any[]).map((raw) => toProduct(raw, domain))
        )
      }
      return found
    },

    /** Adds to the signed-in shopper's cart. Kroger's public API can only add. */
    async addToCart(
      accessToken: string,
      items: { upc: string; quantity: number }[],
      modality: KrogerModality
    ) {
      for (let i = 0; i < items.length; i += 25) {
        await call("/cart/add", {
          token: accessToken,
          method: "PUT",
          body: {
            items: items
              .slice(i, i + 25)
              .map((item) => ({ ...item, modality })),
          },
        })
      }
    },
  }
}

export type KrogerClient = ReturnType<typeof createKrogerClient>

/** Kroger refused the shopper's sign-in: the account needs linking again. */
export class KrogerSignInError extends HttpError {
  constructor() {
    super(
      409,
      "Kroger needs you to link the account again (Settings → Stores)."
    )
  }
}
