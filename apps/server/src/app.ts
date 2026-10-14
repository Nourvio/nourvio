import { existsSync } from "node:fs"
import { join } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { secureHeaders } from "hono/secure-headers"

import { config } from "./config.ts"
import { checkDatabase } from "./db.ts"

export function createApp() {
  const app = new Hono()

  app.use(secureHeaders())
  app.use(compress())

  app.get("/api/health", async (c) => {
    const database = await checkDatabase()
    return c.json({
      status: database === "unavailable" ? "degraded" : "ok",
      version: config.version,
      database,
    })
  })

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404))

  // The web app. Vite gives built assets hashed names, so they can be cached forever.
  app.use(
    "/assets/*",
    serveStatic({
      root: config.webDist,
      onFound: (_path, c) => {
        c.header("Cache-Control", "public, max-age=31536000, immutable")
      },
    })
  )
  app.use(
    "*",
    serveStatic({
      root: config.webDist,
      onFound: (path, c) => {
        c.header(
          "Cache-Control",
          path.endsWith(".html") ? "no-cache" : "public, max-age=3600"
        )
      },
    })
  )

  // Any other page is a client-side route: hand back the app and let React Router decide.
  const indexHtml = join(config.webDist, "index.html")
  app.get(
    "*",
    serveStatic({
      path: indexHtml,
      onFound: (_path, c) => {
        c.header("Cache-Control", "no-cache")
      },
    })
  )
  app.get("*", (c) =>
    existsSync(indexHtml)
      ? c.notFound()
      : c.text(
          "The web app isn't built. In development, open the Vite server on :5173; otherwise run `npm run build`.",
          404
        )
  )

  return app
}
