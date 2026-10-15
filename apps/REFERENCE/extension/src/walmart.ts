import { sizeFromName, type StoreProduct } from "@mise/shared"

/**
 * Walmart, from the person's own Walmart tab. The functions marked "in the
 * page" run inside walmart.com with chrome.scripting.executeScript, so each
 * stands alone. They read the data Walmart's pages carry (__NEXT_DATA__) and
 * press Walmart's own buttons.
 */

export const WALMART = "https://www.walmart.com"
export const WALMART_ORIGINS = ["https://www.walmart.com/*"]

/** A product as a Walmart page describes it. */
export type WalmartRaw = {
  id: string
  name: string
  price: number | null
  was: number | null
  image: string | null
  url: string | null
  inStock: boolean | null
  sponsored: boolean
  brand: string | null
  upc: string | null
}

/** In the page: Walmart's "are you a person?" check is showing. */
export function walmartBlocked() {
  return (
    /robot or human/i.test(document.title) ||
    /robot or human\?|press (?:&|and) hold/i.test(
      document.body?.innerText.slice(0, 3000) ?? ""
    ) ||
    location.pathname.startsWith("/blocked")
  )
}

/** In the page: the products on a Walmart search page, best first as Walmart orders them. */
export function readSearchResults(): {
  blocked: boolean
  products: WalmartRaw[] | null
} {
  const blocked =
    /robot or human/i.test(document.title) ||
    location.pathname.startsWith("/blocked")
  const text = document.getElementById("__NEXT_DATA__")?.textContent
  if (!text) return { blocked, products: null }
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any -- Walmart's JSON */
    const data = JSON.parse(text)
    const stacks: any[] =
      data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? []
    const items: any[] = stacks.flatMap((stack) => stack?.items ?? [])
    const products = items
      .filter((item) => item?.usItemId && item?.name)
      .slice(0, 30)
      .map((item): WalmartRaw => ({
        id: String(item.usItemId),
        name: String(item.name),
        price:
          typeof item.price === "number"
            ? item.price
            : (item.priceInfo?.currentPrice?.price ?? null),
        was: item.priceInfo?.wasPrice?.price ?? null,
        image: item.imageInfo?.thumbnailUrl ?? item.image ?? null,
        url: item.canonicalUrl
          ? `https://www.walmart.com${String(item.canonicalUrl).split("?")[0]}`
          : null,
        inStock: item.availabilityStatusV2?.value
          ? item.availabilityStatusV2.value === "IN_STOCK"
          : null,
        sponsored: Boolean(item.isSponsoredFlag),
        brand: item.brand ? String(item.brand) : null,
        upc: null,
      }))
    return { blocked, products }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    return { blocked, products: null }
  }
}

/** In the page: the product on a Walmart product page. */
export function readProductPage(): WalmartRaw | null {
  const text = document.getElementById("__NEXT_DATA__")?.textContent
  if (!text) return null
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any -- Walmart's JSON */
    const product: any =
      JSON.parse(text)?.props?.pageProps?.initialData?.data?.product
    if (!product?.usItemId || !product?.name) return null
    return {
      id: String(product.usItemId),
      name: String(product.name),
      price: product.priceInfo?.currentPrice?.price ?? null,
      was: product.priceInfo?.wasPrice?.price ?? null,
      image: product.imageInfo?.thumbnailUrl ?? null,
      url: `https://www.walmart.com/ip/${product.usItemId}`,
      inStock: product.availabilityStatus
        ? product.availabilityStatus === "IN_STOCK"
        : null,
      sponsored: false,
      brand: product.brand ? String(product.brand) : null,
      upc: product.upc ? String(product.upc) : null,
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    return null
  }
}

/**
 * In the page: on a product page, presses Walmart's own "Add to cart", then
 * "+" until the cart has `quantity`. Waits for each step rather than
 * hurrying, and stops if Walmart asks whether you're a person.
 */
export async function addToCartOnPage(quantity: number): Promise<{
  ok: boolean
  quantity: number
  blocked: boolean
  reason: string | null
}> {
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))
  const blocked = () =>
    /robot or human/i.test(document.title) ||
    /robot or human\?|press (?:&|and) hold/i.test(
      document.body?.innerText.slice(0, 3000) ?? ""
    )
  const waitFor = async <T>(find: () => T | null, ms: number) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      const found = find()
      if (found) return found
      if (blocked()) return null
      await sleep(250)
    }
    return null
  }
  let name = ""
  try {
    name =
      JSON.parse(document.getElementById("__NEXT_DATA__")?.textContent ?? "{}")
        ?.props?.pageProps?.initialData?.data?.product?.name ?? ""
  } catch {
    // Matched by position instead.
  }
  // The stepper for this product (others on the page are for related items).
  const stepper = () => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="quantity-stepper-inc-button"]'
      )
    )
    return (
      buttons.find((button) =>
        name ? (button.getAttribute("aria-label") ?? "").includes(name) : true
      ) ??
      buttons[0] ??
      null
    )
  }
  const inCart = () =>
    Number(
      stepper()
        ?.getAttribute("aria-label")
        ?.match(/Current Quantity (\d+)/i)?.[1] ?? 0
    )
  const fail = (reason: string) => ({
    ok: false,
    quantity: inCart(),
    blocked: blocked(),
    reason: blocked() ? "Walmart asked whether you're a person" : reason,
  })

  const first = await waitFor(
    () =>
      document.querySelector<HTMLButtonElement>(
        'button[data-automation-id="atc"]'
      ) ?? stepper(),
    12_000
  )
  if (!first) return fail("No Add to cart on its page (out of stock?)")
  if (first.getAttribute("data-automation-id") === "atc") {
    if (first.disabled) return fail("Out of stock")
    first.click()
    if (!(await waitFor(stepper, 10_000))) return fail("Walmart didn't add it")
  }
  for (let tries = 0; inCart() < quantity && tries < quantity + 5; tries++) {
    stepper()?.click()
    await sleep(900)
  }
  return { ok: true, quantity: inCart(), blocked: false, reason: null }
}

/** A Walmart product as Nourvio keeps it. Sponsored results are Walmart's ads. */
export function toProduct(raw: WalmartRaw): StoreProduct {
  const onSale = raw.was !== null && raw.price !== null && raw.was > raw.price
  return {
    id: raw.id,
    upc: raw.upc,
    name: raw.name.slice(0, 300),
    brand: raw.brand?.slice(0, 120) ?? null,
    size: sizeFromName(raw.name),
    image: raw.image && /^https:\/\//.test(raw.image) ? raw.image : null,
    price: onSale ? raw.was : raw.price,
    salePrice: onSale ? raw.price : null,
    aisle: null,
    aisleNumber: null,
    inStock: raw.inStock,
    url: raw.url,
  }
}

/** Search results to offer: in stock and not ads first, up to eight. */
export function candidates(raws: WalmartRaw[]) {
  const rank = (raw: WalmartRaw) =>
    (raw.inStock === false ? 2 : 0) + (raw.sponsored ? 1 : 0)
  return [...raws]
    .map((raw, index) => ({ raw, index }))
    .sort((a, b) => rank(a.raw) - rank(b.raw) || a.index - b.index)
    .slice(0, 8)
    .map(({ raw }) => toProduct(raw))
}

export const searchUrl = (term: string) =>
  `${WALMART}/search?q=${encodeURIComponent(term)}`
