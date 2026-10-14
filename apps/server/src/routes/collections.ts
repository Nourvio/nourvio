import type { BrowseCollection } from "@mise/shared"
import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { STARTER_COLLECTIONS } from "../collections/starter.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import type { Db } from "../db/client.ts"
import { recipes } from "../db/schema.ts"
import { normalizeUrl } from "../import/links.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { remoteThumbnail } from "../services/remote-images.ts"

/** Which of these links are in the household's library already, by link. */
export async function inLibrary(db: Db, householdId: string, urls: string[]) {
  const found = new Map<string, { slug: string; name: string }>()
  if (!urls.length) return found
  const normal = urls.map((url) => normalizeUrl(url))
  const rows = await db
    .select({ slug: recipes.slug, name: recipes.name, url: recipes.sourceUrl })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        inArray(recipes.sourceUrl, normal)
      )
    )
  for (const row of rows) {
    if (row.url) found.set(row.url, { slug: row.slug, name: row.name })
  }
  return found
}

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
