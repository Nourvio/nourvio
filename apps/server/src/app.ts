import { existsSync } from "node:fs"
import { join } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { csrf } from "hono/csrf"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"

import { createAiService } from "./ai/service.ts"
import { createNutritionService } from "./services/nutrition.ts"
import { createPhotoService } from "./services/photos.ts"
import { loadSession, requireUser } from "./auth/middleware.ts"
import { config } from "./config.ts"
import type { AppContext, AppEnv } from "./context.ts"
import { pingDatabase } from "./db/client.ts"
import { HttpError } from "./http.ts"
import { aiRoutes } from "./routes/ai.ts"
import { authRoutes } from "./routes/auth.ts"
import { chatRoutes } from "./routes/chat.ts"
import { collectionsRoutes } from "./routes/collections.ts"
import { householdRoutes } from "./routes/household.ts"
import { imagesRoutes } from "./routes/images.ts"
import { importRoutes } from "./routes/import.ts"
import { joinRoutes, signupRoutes } from "./routes/join.ts"
import { listRoutes } from "./routes/list.ts"
import { meRoutes } from "./routes/me.ts"
import { nutritionRoutes } from "./routes/nutrition.ts"
import { pantryRoutes } from "./routes/pantry.ts"
import { photosRoutes } from "./routes/photos.ts"
import { planRoutes } from "./routes/plan.ts"
import { proposalsRoutes } from "./routes/proposals.ts"
import { recipesRoutes } from "./routes/recipes.ts"
import { serverRoutes } from "./routes/server.ts"
import { setupRoutes } from "./routes/setup.ts"
import { usersRoutes } from "./routes/users.ts"

/** Routes that accept photos, with their own upload size limit. */
const UPLOAD_PATH = /^\/api\/(recipes\/[^/]+\/image|import\/photo)$/

/**
 * Form posts from another site are refused. The page's own origin can differ
 * in scheme from what the server sees (https at Cloudflare, http inside the
 * stack), so compare hosts, and also allow PUBLIC_URL.
 */
function isSameSite(origin: string, c: Context) {
  try {
    const { host } = new URL(origin)
    if (host === c.req.header("host") || host === new URL(c.req.url).host) {
      return true
    }
    return config.publicUrl ? new URL(config.publicUrl).host === host : false
  } catch {
    return false
  }
}

export function createApp(ctx: AppContext) {
  const app = new Hono<AppEnv>()
  const ai = createAiService(ctx.db, ctx.aiFactory)
  const nutrition = createNutritionService(ctx.db, ai, {
    fdcFactory: ctx.fdcFactory,
    auto: ctx.autoNutrition,
  })
  const photos = createPhotoService(ctx.db, ai, { auto: ctx.autoPhotos })

  app.use(secureHeaders())
  // Compression would hold back a streaming chat reply, so skip it there.
  const compression = compress()
  app.use((c, next) =>
    c.req.path === "/api/chat" ? next() : compression(c, next)
  )

  // ---- API ----
  app.use("/api/*", csrf({ origin: isSameSite }))
  const jsonLimit = bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "That request is too large" }, 413),
  })
  // Photo uploads set their own, larger limit on the route.
  app.use("/api/*", (c, next) =>
    UPLOAD_PATH.test(c.req.path) ? next() : jsonLimit(c, next)
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
  app.route("/api/join", joinRoutes(ctx))
  app.route("/api/signup", signupRoutes(ctx))
  app.route("/api/household", householdRoutes(ctx))
  app.route("/api/users", usersRoutes(ctx))
  app.route("/api/server", serverRoutes(ctx))
  app.route("/api/recipes", recipesRoutes(ctx, ai, nutrition, photos))
  app.route("/api/proposals", proposalsRoutes(ctx, ai, nutrition, photos))
  app.route("/api/nutrition", nutritionRoutes(ctx, nutrition))
  app.route("/api/photos", photosRoutes(photos))
  app.route("/api/collections", collectionsRoutes(ctx))
  app.route("/api/plan", planRoutes(ctx))
  app.route("/api/list", listRoutes(ctx))
  app.route("/api/pantry", pantryRoutes(ctx))
  app.route("/api/images", imagesRoutes(ctx))
  app.route("/api/import", importRoutes(ctx, ai, nutrition, photos))
  app.route("/api/ai", aiRoutes(ctx, ai))
  app.route("/api/chat", chatRoutes(ctx, ai))
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
