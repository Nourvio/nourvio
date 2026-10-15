import { z } from "zod"

/** Stores Nourvio can shop at. */
export const SHOPS = ["kroger", "costco", "walmart"] as const
export type ShopId = (typeof SHOPS)[number]

/** A product at a store, as Nourvio remembers it for something on the list. */
export type StoreProduct = {
  /** The store's own id (Kroger's productId, Walmart's item id). */
  id: string
  upc: string | null
  name: string
  brand: string | null
  /** As the store writes it: "1 gal", "16 oz", "12 ct". */
  size: string | null
  /** The store's photo; shown through Nourvio (see storeImageUrl). */
  image: string | null
  price: number | null
  /** The price while there's a sale. */
  salePrice: number | null
  /** The sale's last day, when the store says ("2026-10-20"). */
  saleEnds?: string | null
  /** "Aisle 12", at the household's store. */
  aisle: string | null
  /** For walking the store in order. */
  aisleNumber: number | null
  inStock: boolean | null
  /** The product's page at the store. */
  url: string | null
}

/** A store's photo, through Nourvio. */
export function storeImageUrl(image: string | null) {
  return image ? `/api/shop/image?u=${encodeURIComponent(image)}` : null
}

/** What a package holds: grams, millilitres or a count. */
export type ProductSize = {
  kind: "weight" | "volume" | "count"
  amount: number
  /** How many are in a multipack: "24 pk / 12 fl oz" is 24 cans. */
  count?: number
}

const SIZE_UNITS: [RegExp, ProductSize["kind"], number][] = [
  [/^(fl oz|fluid ounces?|fl ounces?)$/, "volume", 29.5735],
  [/^(oz|ounces?)$/, "weight", 28.3495],
  [/^(lbs?|pounds?)$/, "weight", 453.592],
  [/^(g|gm|grams?)$/, "weight", 1],
  [/^(kg|kilograms?)$/, "weight", 1000],
  [/^(ml|milliliters?|millilitres?)$/, "volume", 1],
  [/^(l|lt|ltr|liters?|litres?)$/, "volume", 1000],
  [/^(gal|gallons?)$/, "volume", 3785.41],
  [/^(qt|quarts?)$/, "volume", 946.353],
  [/^(pt|pints?)$/, "volume", 473.176],
  [/^(dozen|dz|doz)$/, "count", 12],
  [
    /^(ct|count|each|ea|pk|pack|pc|pcs|pieces?|bunch|bunches|heads?|bags?|loaf|loaves|cans?|jars?|bottles?|box|boxes|rolls?|sticks?|cups?|tubs?|links?|fillets?|steaks?)$/,
    "count",
    1,
  ],
]

const NUMBER = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)`

function readNumber(text: string) {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = text.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(text)
}

function readUnit(words: string) {
  // "fl oz" is two words; anything after the unit ("bag", "family pack") is extra.
  const parts = words.split(/\s+/).filter(Boolean)
  for (const take of [2, 1]) {
    const unit = parts.slice(0, take).join(" ")
    const found = SIZE_UNITS.find(([pattern]) => pattern.test(unit))
    if (found) return { kind: found[1], factor: found[2] }
  }
  return null
}

/**
 * Reads a package size the way stores write it: "1 gal", "16 oz", "3 lb
 * bag", "12 ct", "1/2 gal", "6 ct / 12 fl oz" (six 12 oz cans). Null when
 * it can't be read.
 */
export function parseProductSize(size: string | null): ProductSize | null {
  if (!size) return null
  const text = size
    .toLowerCase()
    .replace(/fl\.?\s*oz\.?/g, "fl oz")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[.,](?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim()

  // A multipack: "6 ct / 12 fl oz", "12 x 1 oz", "4 pk - 16.9 fl oz".
  const multi = text.match(
    new RegExp(
      String.raw`^${NUMBER}\s*(?:(?:ct|pk|pack|count)\s*[/x×-]|[x×])\s*${NUMBER}\s+(.+)$`
    )
  )
  if (multi) {
    const unit = readUnit(multi[3]!)
    if (unit) {
      return {
        kind: unit.kind,
        amount: readNumber(multi[1]!) * readNumber(multi[2]!) * unit.factor,
        count: readNumber(multi[1]!),
      }
    }
  }

  const simple = text.match(new RegExp(String.raw`^${NUMBER}\s*(.+)$`))
  if (!simple) return null
  const unit = readUnit(simple[2]!)
  const amount = readNumber(simple[1]!)
  if (!unit || !(amount > 0)) return null
  return { kind: unit.kind, amount: amount * unit.factor }
}

/**
 * How much of something the list needs, every way Nourvio could work it out:
 * a count ("2 onions"), grams and millilitres, and what one weighs.
 */
export type Need = {
  count: number | null
  grams: number | null
  ml: number | null
  /** What one weighs ("1 medium onion" is 110 g), for stores that sell by the each. */
  eachGrams: number | null
  /** Counted in cans, jars or packages: one of the store's is one of these. */
  containers?: boolean
  /** Packs of a size: "2 × 12-pack" is 2 packs of 12 (and a count of 24). */
  packs?: { count: number; size: number } | null
}

const PACK_WORDS = String.raw`(?:pk|packs?)`
const ITEM_WORDS = String.raw`(?:ct|count|cans?|bottles?|jars?|boxes?|bags?|rolls?|pouches?)`

/**
 * Reads an amount written as packs or containers, as every-week items
 * often are: "2 × 12-pack" or "2 12-packs" (24, as 2 packs of 12),
 * "12-pack", "6 cans", "2 ×" anything (2 of them).
 */
export function readPackAmount(
  text: string
): Pick<Need, "count" | "packs"> | null {
  const trimmed = text.trim().toLowerCase()
  const packs = trimmed.match(
    new RegExp(
      String.raw`^(?:(\d+)\s*(?:[×x]\s*|\s+))?(\d+)[\s-]*${PACK_WORDS}\b`
    )
  )
  if (packs) {
    const count = packs[1] ? Number(packs[1]) : 1
    const size = Number(packs[2])
    if (count > 0 && size > 0)
      return { count: count * size, packs: { count, size } }
  }
  const items = trimmed.match(new RegExp(String.raw`^(\d+)\s*${ITEM_WORDS}\b`))
  if (items && Number(items[1]) > 0)
    return { count: Number(items[1]), packs: null }
  const times = trimmed.match(/^(\d+)\s*[×x]/)
  if (times && Number(times[1]) > 0)
    return { count: Number(times[1]), packs: null }
  return null
}

/** A little over a package still counts as one: recipes aren't that exact. */
const LEEWAY = 0.1

function round(needed: number, perPackage: number) {
  return Math.min(99, Math.max(1, Math.ceil(needed / perPackage - LEEWAY)))
}

/**
 * Packages to buy for what's needed. `sure` is false when the amount and
 * the package couldn't be compared, so the count is a guess to check.
 */
export function packagesFor(
  need: Need,
  size: ProductSize | null
): { packages: number; sure: boolean } {
  if (need.containers && need.count) {
    // A multipack, or a count: as many as make up what's needed.
    if (size?.count)
      return { packages: round(need.count, size.count), sure: true }
    if (size?.kind === "count") {
      return { packages: round(need.count, size.amount), sure: true }
    }
    // Packs wanted, a single bottle offered: can't compare.
    if (need.packs) return { packages: need.packs.count, sure: false }
    return { packages: round(need.count, 1), sure: Boolean(size) }
  }
  if (!size) {
    return need.count
      ? { packages: round(need.count, 1), sure: false }
      : { packages: 1, sure: false }
  }
  if (size.kind === "count") {
    if (need.count)
      return { packages: round(need.count, size.amount), sure: true }
    if (need.grams && need.eachGrams) {
      return {
        packages: round(need.grams / need.eachGrams, size.amount),
        sure: true,
      }
    }
    return { packages: 1, sure: false }
  }
  if (size.kind === "weight") {
    if (need.grams)
      return { packages: round(need.grams, size.amount), sure: true }
    // Close enough for watery things, but worth a look.
    if (need.ml) return { packages: round(need.ml, size.amount), sure: false }
    return { packages: 1, sure: false }
  }
  if (need.ml) return { packages: round(need.ml, size.amount), sure: true }
  if (need.grams)
    return { packages: round(need.grams, size.amount), sure: false }
  return { packages: 1, sure: false }
}

/** Something on the list, with the product Nourvio would buy for it. */
export type BasketLine = {
  itemId: string
  name: string
  /** As the list shows it: "1 ½ lb". */
  amount: string
  product: StoreProduct | null
  /** Nourvio's pick, not chosen by anyone yet: worth a look. */
  suggested: boolean
  packages: number
  /** False when the amount and package size couldn't be compared. */
  sure: boolean
  /** Sent to the store already. */
  sent: boolean
  /** What a package usually costs, when today's price is well under it. */
  usual: number | null
}

/** The list, ready to send to a store. */
export type Basket = {
  shop: ShopId
  /** The store's own name: "Fry's". */
  storeName: string
  lines: BasketLine[]
  /** When the list was last sent. */
  sentAt: string | null
}

export const pickProductInput = z.object({
  productId: z.string().trim().min(1).max(64),
})

export const sendBasketInput = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        packages: z.number().int().min(1).max(99),
      })
    )
    .min(1, "Pick something to send")
    .max(300),
})
export type SendBasketInput = z.input<typeof sendBasketInput>

/** What a line costs: the sale price when there is one. */
export function lineCost(line: Pick<BasketLine, "product" | "packages">) {
  const each = line.product?.salePrice ?? line.product?.price
  return each === null || each === undefined ? null : each * line.packages
}

/** What a list item last cost at its list's store, from the product remembered for it. */
export type ItemPrice = {
  shop: ShopId
  /** For the packages needed, at the sale price when there is one. */
  total: number
  packages: number
  /** False when the number of packages is a guess. */
  sure: boolean
  sale: boolean
  /** What the sale takes off, for the packages needed. */
  saved: number | null
  /** The sale's last day, when the store says. */
  saleEnds: string | null
  /** What a package usually costs, when today's price is well under it. */
  usual: number | null
  /** The product it's priced from. */
  product: string
  /** When that price was seen. */
  seenAt: string
}

/** Unchecked items' prices, by item id. Items without a remembered product are left out. */
export type ListPrices = Record<string, ItemPrice>

/** The Kroger-family store a household shops at. */
export type KrogerStore = {
  locationId: string
  /** "Fry's Food Stores - Tempe" */
  name: string
  /** The chain's own name: "Fry's". */
  banner: string
  address: string
}

export const KROGER_MODALITIES = ["PICKUP", "DELIVERY"] as const
export type KrogerModality = (typeof KROGER_MODALITIES)[number]

/** A household's store connections. */
export type ShopStatus = {
  kroger: {
    /** The server has a Kroger app to sign in with. */
    ready: boolean
    store: KrogerStore | null
    modality: KrogerModality
    /** Whose Kroger account the cart is, and since when. */
    linked: { by: string; at: string } | null
    /** Kroger stopped accepting the sign-in; link the account again. */
    needsRelink: boolean
    /** When Nourvio last checked the store's prices and sales. */
    pricesCheckedAt: string | null
  }
}

/** The server's Kroger app (Settings → Connections, server admin). */
export type KrogerAppSettings = {
  clientId: string | null
  /** The end of the secret, to recognize it. */
  secretHint: string | null
  /** A server environment variable wins over Settings. */
  source: "env" | "settings" | null
  /** Where Kroger sends people back after signing in; register it with the app. */
  redirectUri: string
}

export const krogerAppInput = z.object({
  clientId: z.string().trim().min(1).max(200).nullable(),
  clientSecret: z.string().trim().min(1).max(200).nullable().optional(),
})

export const krogerSettingsInput = z.object({
  locationId: z.string().trim().min(1).max(20).optional(),
  modality: z.enum(KROGER_MODALITIES).optional(),
})

/** http and https links only: a page can say anything. */
const webLink = z.url({ protocol: /^https?$/ }).max(1000)

/** A product as the browser extension read it from a store's site (Walmart). */
export const storeProductSchema = z.object({
  id: z.string().trim().min(1).max(64),
  upc: z.string().trim().max(20).nullable(),
  name: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(120).nullable(),
  size: z.string().trim().max(60).nullable(),
  image: webLink.nullable(),
  price: z.number().nonnegative().max(10_000).nullable(),
  salePrice: z.number().nonnegative().max(10_000).nullable(),
  saleEnds: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  aisle: z.string().trim().max(60).nullable(),
  aisleNumber: z.number().nullable(),
  inStock: z.boolean().nullable(),
  url: webLink.nullable(),
})

export const saveProductInput = z.object({ product: storeProductSchema })

/** Each item's search results at a store, for Nourvio to pick from. */
export const suggestProductsInput = z.object({
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        products: z.array(storeProductSchema).max(12),
      })
    )
    .max(200),
})
export type SuggestProductsInput = z.input<typeof suggestProductsInput>

/**
 * The package size in a product's name, for stores that don't list it on
 * its own: "Great Value Whole Milk, Half Gallon, 64 fl oz" → "64 fl oz".
 */
export function sizeFromName(name: string) {
  const sizes = [
    ...name.matchAll(
      /(\d+(?:\.\d+)?\s*(?:ct|count|pk|pack)\s*[/x×,-]?\s*)?\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|lbs?|ct|count|g|kg|ml|l|gal|gallons?|qt|pt|dozen|pk|pack)\b/gi
    ),
  ].map((match) => match[0].trim())
  return sizes.findLast((size) => parseProductSize(size)) ?? null
}
