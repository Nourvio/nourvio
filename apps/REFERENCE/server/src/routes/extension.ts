import { readFile } from "node:fs/promises"

import { createExtensionTokenInput } from "@mise/shared"
import { Hono } from "hono"

import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../auth/api-tokens.ts"
import { requireUser } from "../auth/middleware.ts"
import { config } from "../config.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"

/** The Nourvio browser extension: connecting it (its API tokens) and downloading it. */
export function extensionRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/tokens", async (c) =>
    c.json({ tokens: await listApiTokens(db, currentUser(c).id) })
  )

  // Only from Nourvio itself, signed in: a token can't make more tokens.
  app.post("/tokens", async (c) => {
    if (c.get("viaToken")) {
      throw new HttpError(403, "Connect the extension from Nourvio, signed in")
    }
    const { name } = await readBody(c, createExtensionTokenInput)
    return c.json(await createApiToken(db, currentUser(c).id, name), 201)
  })

  app.delete("/tokens/:id", async (c) => {
    await revokeApiToken(db, currentUser(c).id, c.req.param("id"))
    return c.body(null, 204)
  })

  app.get("/download", async (c) => {
    let zip: Buffer
    try {
      zip = await readFile(config.extensionZip)
    } catch {
      throw new HttpError(
        404,
        "This server doesn't have the extension built. It comes with the Docker image; in development, run npm run build -w @mise/extension."
      )
    }
    return c.body(new Uint8Array(zip), 200, {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="nourvio-extension.zip"',
      "cache-control": "no-cache",
    })
  })

  return app
}
