import {
  krogerAppInput,
  krogerSettingsInput,
  pickProductInput,
  saveProductInput,
  sendBasketInput,
  suggestProductsInput,
} from "@mise/shared"
import { Hono, type Context } from "hono"

import {
  requireAdmin,
  requireServerAdmin,
  requireUser,
} from "../auth/middleware.ts"
import { config } from "../config.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { remoteThumbnail } from "../services/remote-images.ts"
import { listDeals } from "../services/sales.ts"
import type { ShopService } from "../services/shop.ts"

/** Store photos Nourvio will fetch: the stores' own image servers only. */
const IMAGE_HOSTS =
  /(^|\.)(kroger\.com|walmartimages\.com|costco\.com|costco-static\.com)$/i

/** Where Kroger sends people back after they sign in. */
function redirectUri(c: Context<AppEnv>) {
  if (config.publicUrl) {
    return `${new URL(config.publicUrl).origin}/api/shop/kroger/callback`
  }
  const proto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ??
    new URL(c.req.url).protocol.replace(":", "")
  const host =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ??
    c.req.header("host") ??
    new URL(c.req.url).host
  return `${proto}://${host}/api/shop/kroger/callback`
}

/** Store connections, the review before sending, and store photos. */
export function shopRoutes(
  { db, fetcher = fetchPublic }: AppContext,
  shop: ShopService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  const actor = (c: Context<AppEnv>) => ({
    userId: currentUser(c).id,
    householdId: currentHousehold(c),
  })

  app.get("/", async (c) =>
    c.json({ status: await shop.status(currentHousehold(c)) })
  )

  /** What's left on the lists last cost, where Nourvio knows the product. */
  app.get("/prices", async (c) =>
    c.json({ prices: await shop.prices(currentHousehold(c)) })
  )

  /** This week's sales at the household's Fry's, and the recipes they're in. */
  app.get("/deals", async (c) =>
    c.json({ deals: await listDeals(db, currentHousehold(c)) })
  )

  app.get("/image", async (c) => {
    const url = c.req.query("u") ?? ""
    let host = ""
    try {
      const parsed = new URL(url)
      if (parsed.protocol === "https:") host = parsed.hostname
    } catch {
      // Not a link.
    }
    if (!IMAGE_HOSTS.test(host))
      return c.json({ error: "Not a store photo" }, 404)
    try {
      const image = await remoteThumbnail(fetcher, url, undefined, "product")
      return c.body(new Uint8Array(image), 200, {
        "content-type": "image/webp",
        "cache-control": "private, max-age=604800",
      })
    } catch {
      return c.json({ error: "That photo couldn't be fetched" }, 404)
    }
  })

  // ---- The server's Kroger app ----
  app.get("/kroger/app", requireServerAdmin, async (c) =>
    c.json({ app: await shop.krogerAppSettings(redirectUri(c)) })
  )
  app.put("/kroger/app", requireServerAdmin, async (c) => {
    await shop.saveKrogerApp(await readBody(c, krogerAppInput))
    return c.json({ app: await shop.krogerAppSettings(redirectUri(c)) })
  })

  // ---- The household's store and account ----
  app.get("/kroger/locations", async (c) =>
    c.json({ stores: await shop.locations(c.req.query("zip")?.trim() ?? "") })
  )
  app.put("/kroger", requireAdmin, async (c) =>
    c.json({
      status: await shop.saveKrogerSettings(
        currentHousehold(c),
        await readBody(c, krogerSettingsInput)
      ),
    })
  )
  app.post("/kroger/link", requireAdmin, async (c) =>
    c.json({
      url: await shop.startLink(
        currentHousehold(c),
        currentUser(c),
        redirectUri(c)
      ),
    })
  )
  // Kroger sends the browser back here after signing in.
  app.get("/kroger/callback", async (c) => {
    const code = c.req.query("code")
    const state = c.req.query("state")
    if (!code || !state) {
      return c.redirect("/settings?kroger=cancelled#connections")
    }
    try {
      await shop.finishLink(state, code, currentUser(c).id)
      return c.redirect("/settings?kroger=linked#connections")
    } catch (error) {
      const reason =
        error instanceof HttpError ? error.message : "It didn't work"
      return c.redirect(
        `/settings?kroger=failed&reason=${encodeURIComponent(reason)}#connections`
      )
    }
  })
  app.delete("/kroger/link", requireAdmin, async (c) =>
    c.json({ status: await shop.unlink(currentHousehold(c)) })
  )

  // ---- Shopping ----
  app.get("/kroger/basket", async (c) =>
    c.json({ basket: await shop.basket(currentHousehold(c), actor(c)) })
  )
  /** Checks today's prices and sales now, rather than waiting for the morning. */
  app.post("/kroger/prices", async (c) =>
    c.json({ check: await shop.checkPrices(currentHousehold(c)) })
  )
  app.get("/kroger/search", async (c) =>
    c.json({
      products: await shop.search(currentHousehold(c), c.req.query("q") ?? ""),
    })
  )
  app.put("/kroger/products/:itemId", async (c) => {
    const { productId } = await readBody(c, pickProductInput)
    return c.json({
      line: await shop.pick(
        currentHousehold(c),
        c.req.param("itemId"),
        productId
      ),
    })
  })
  app.post("/kroger/send", async (c) =>
    c.json(
      await shop.send(currentHousehold(c), await readBody(c, sendBasketInput))
    )
  )

  // ---- Walmart, through the browser extension ----
  // Nourvio can't reach Walmart itself: the extension searches and fills the
  // cart in the person's own Walmart tab, and Nourvio keeps the picks.
  app.get("/walmart/basket", async (c) =>
    c.json({ basket: await shop.storeBasket(currentHousehold(c), "walmart") })
  )
  app.post("/walmart/suggest", async (c) =>
    c.json({
      basket: await shop.suggest(
        currentHousehold(c),
        actor(c),
        "walmart",
        await readBody(c, suggestProductsInput)
      ),
    })
  )
  app.put("/walmart/products/:itemId", async (c) => {
    const { product } = await readBody(c, saveProductInput)
    return c.json({
      line: await shop.saveProduct(
        currentHousehold(c),
        "walmart",
        c.req.param("itemId"),
        product
      ),
    })
  })
  app.post("/walmart/sent", async (c) =>
    c.json(
      await shop.recordSent(
        currentHousehold(c),
        "walmart",
        await readBody(c, sendBasketInput)
      )
    )
  )

  return app
}
