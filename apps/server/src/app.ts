import { existsSync } from "node:fs"
import { join } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { csrf } from "hono/csrf"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"

import { loadSession, requireUser } from "./auth/middleware.ts"
import { config } from "./config.ts"
import type { AppContext, AppEnv } from "./context.ts"
import { pingDatabase } from "./db/client.ts"
import { HttpError } from "./http.ts"
import { authRoutes } from "./routes/auth.ts"
import { meRoutes } from "./routes/me.ts"
import { setupRoutes } from "./routes/setup.ts"
import { usersRoutes } from "./routes/users.ts"

/**
 * Form posts from another site are refused. The page's own origin can differ
 * in scheme from what the server sees (https at Cloudflare, http inside the
 * stack), so compare hosts, and also allow PUBLIC_URL.
 */
function isSameSite(origin: string, c: Context) {
  try {
    const { host } = new URL(origin)
    if (host === c.req.header("host")) return true
    return config.publicUrl ? new URL(config.publicUrl).host === host : false
  } catch {
    return false
  }
}

export function createApp(ctx: AppContext) {
  const app = new Hono<AppEnv>()

  app.use(secureHeaders())
  app.use(compress())

  // ---- API ----
  app.use("/api/*", csrf({ origin: isSameSite }))
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "That request is too large" }, 413),
    })
  )
  app.use("/api/*", loadSession(ctx.db))

  app.get("/api/health", async (c) => {
    const database = (await pingDatabase(ctx.db)) ? "ok" : "unavailable"
    return c.json({
      status: database === "ok" ? "ok" : "degraded",
      version: config.version,
      database,
    })
  })
  app.route("/api/setup", setupRoutes(ctx))
  app.route("/api/auth", authRoutes(ctx))
  app.route("/api/me", meRoutes(ctx))
  app.route("/api/users", usersRoutes(ctx))
  app.all("/api/*", requireUser, (c) => c.json({ error: "Not found" }, 404))

  // ---- Web app ----
  // Vite gives built assets hashed names, so they can be cached forever.
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
          path.endsWith(".html") || path.endsWith(".webmanifest")
            ? "no-cache"
            : "public, max-age=3600"
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

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      for (const [name, value] of Object.entries(error.headers ?? {})) {
        c.header(name, value)
      }
      return c.json(
        { error: error.message, fields: error.fields },
        error.status
      )
    }
    if (error instanceof HTTPException) return error.getResponse()
    console.error(error)
    return c.json({ error: "Something went wrong on the server" }, 500)
  })

  return app
}
