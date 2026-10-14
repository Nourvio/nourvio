import type { BrowseCollection } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { STARTER_COLLECTIONS } from "../collections/starter.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { inLibrary, normalizeUrl } from "../import/links.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { remoteThumbnail } from "../services/remote-images.ts"

/** Hand-picked starter collections, and their photos. */
export function collectionsRoutes({ db, fetcher = fetchPublic }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) => {
    const library = await inLibrary(
      db,
      currentHousehold(c),
      STARTER_COLLECTIONS.flatMap((collection) =>
        collection.recipes.map((recipe) => recipe.url)
      )
    )
    const collections: BrowseCollection[] = STARTER_COLLECTIONS.map(
      (collection) => ({
        id: collection.id,
        title: collection.title,
        description: collection.description,
        recipes: collection.recipes.map((recipe, index) => ({
          url: recipe.url,
          title: recipe.title,
          site: recipe.site,
          minutes: recipe.minutes,
          imageUrl: recipe.image
            ? `/api/collections/${collection.id}/${index}/image`
            : null,
          inLibrary: library.get(normalizeUrl(recipe.url)) ?? null,
        })),
      })
    )
    return c.json({ collections })
  })

  app.get("/:id/:index/image", async (c) => {
    const collection = STARTER_COLLECTIONS.find(
      (item) => item.id === c.req.param("id")
    )
    const recipe = collection?.recipes[Number(c.req.param("index"))]
    if (!recipe?.image) return c.json({ error: "No photo" }, 404)
    try {
      const image = await remoteThumbnail(fetcher, recipe.image, recipe.url)
      return c.body(new Uint8Array(image), 200, {
        "content-type": "image/webp",
        "cache-control": "private, max-age=604800",
      })
    } catch {
      return c.json({ error: "That photo couldn't be fetched" }, 404)
    }
  })

  return app
}
