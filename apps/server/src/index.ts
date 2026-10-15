import { serve } from "@hono/node-server"

import { createAiService } from "./ai/service.ts"
import { createApp } from "./app.ts"
import { SetupCode } from "./auth/setup-code.ts"
import { config } from "./config.ts"
import { createDb, waitForDatabase } from "./db/client.ts"
import { runMigrations } from "./db/migrate.ts"
import { seedReferenceData } from "./db/seed.ts"
import { fetchPublic } from "./import/safe-fetch.ts"
import { scheduleYtDlpUpdates } from "./import/video-tools.ts"
import { startAutoPlanScheduler } from "./services/autoplan.ts"
import { markInterruptedJobs } from "./services/cleanup-jobs.ts"
import { startPriceScheduler } from "./services/price-checks.ts"
import { createShopService } from "./services/shop.ts"
import { startSitesScheduler } from "./services/sites.ts"
import { countUsers } from "./services/users.ts"

if (!config.databaseUrl) {
  console.error(
    "DATABASE_URL isn't set. For local development run `npm run db:up` and copy .env.example to .env."
  )
  process.exit(1)
}

const { db, close } = createDb(config.databaseUrl)
await waitForDatabase(db)
await runMigrations(db)
await seedReferenceData(db)
await markInterruptedJobs(db)

const setupCode = new SetupCode()
if ((await countUsers(db)) === 0) {
  const code = setupCode.issue()
  console.log(
    [
      "",
      "  ====================================================",
      "   Welcome to Mise. Open the app to create the first",
      `   account, and enter this setup code: ${code}`,
      "  ====================================================",
      "",
    ].join("\n")
  )
}

// Fry's prices each morning, and households that plan their week ahead by
// themselves (with that week's sales checked first).
const shop = createShopService(db, createAiService(db))
startPriceScheduler(db, shop)
startAutoPlanScheduler(db, {
  beforePlan: async (householdId) => {
    if ((await shop.status(householdId)).kroger.store) {
      await shop.checkPrices(householdId)
    }
  },
})
startSitesScheduler(db, fetchPublic)

// In the Docker image, keep yt-dlp current. A local install is left alone.
if (process.env.NODE_ENV === "production") scheduleYtDlpUpdates()

const server = serve(
  {
    fetch: createApp({ db, setupCode }).fetch,
    port: config.port,
    hostname: "0.0.0.0",
  },
  (info) => console.log(`Mise ${config.version} listening on port ${info.port}`)
)

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(() => {
    close().finally(() => process.exit(0))
  })
  // Don't hang forever on open connections.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
