import { rateInput, recipeInput } from "@mise/shared"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireUser } from "../auth/middleware.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { deleteImage, saveImage } from "../services/images.ts"
import {
  createRecipe,
  deleteRecipe,
  findRecipeRow,
  getRecipe,
  listRecipes,
  listTags,
  listVersions,
  restoreVersion,
  setRecipeFields,
  updateRecipe,
} from "../services/recipes.ts"

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export function recipesRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) => {
    const recipes = await listRecipes(db, {
      q: c.req.query("q"),
      tag: c.req.query("tag"),
    })
    return c.json({ recipes })
  })

  app.get("/tags", async (c) => c.json({ tags: await listTags(db) }))

  app.post("/", async (c) => {
    const input = await readBody(c, recipeInput)
    const recipe = await createRecipe(db, input, {
      origin: "manual",
      userId: currentUser(c).id,
    })
    return c.json({ recipe }, 201)
  })

  app.get("/:id", async (c) =>
    c.json({ recipe: await getRecipe(db, c.req.param("id")) })
  )

  app.put("/:id", async (c) => {
    const input = await readBody(c, recipeInput)
    const recipe = await updateRecipe(db, c.req.param("id"), input, {
      userId: currentUser(c).id,
    })
    return c.json({ recipe })
  })

  app.patch("/:id", async (c) => {
    const { rating } = await readBody(c, rateInput)
    return c.json({
      recipe: await setRecipeFields(db, c.req.param("id"), { rating }),
    })
  })

  app.delete("/:id", async (c) => {
    await deleteRecipe(db, c.req.param("id"))
    return c.body(null, 204)
  })

  app.post("/:id/made", async (c) =>
    c.json({
      recipe: await setRecipeFields(db, c.req.param("id"), {
        lastMadeAt: new Date(),
      }),
    })
  )

  app.post(
    "/:id/image",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: "That photo is over 20 MB" }, 413),
    }),
    async (c) => {
      const row = await findRecipeRow(db, c.req.param("id"))
      const body = await c.req.parseBody()
      const file = body.image
      if (!(file instanceof File)) {
        throw new HttpError(400, "Choose a photo to upload")
      }
      const image = await saveImage(Buffer.from(await file.arrayBuffer()))
      const recipe = await setRecipeFields(db, row.id, { image })
      await deleteImage(row.image)
      return c.json({ recipe })
    }
  )

  app.delete("/:id/image", async (c) => {
    const row = await findRecipeRow(db, c.req.param("id"))
    const recipe = await setRecipeFields(db, row.id, { image: null })
    await deleteImage(row.image)
    return c.json({ recipe })
  })

  app.get("/:id/versions", async (c) =>
    c.json({ versions: await listVersions(db, c.req.param("id")) })
  )

  app.post("/:id/versions/:versionId/restore", async (c) => {
    const recipe = await restoreVersion(
      db,
      c.req.param("id"),
      c.req.param("versionId"),
      currentUser(c).id
    )
    return c.json({ recipe })
  })

  return app
}
