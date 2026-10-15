import { serve } from "@hono/node-server"
import { createApp } from "./app.ts"
import { loadConfig, type Config } from "./core/config.ts"
import { createLogger } from "./core/logger.ts"
import { migrate, openDatabase, type Database } from "./db/orm.ts"

let config: Config
try {
  config = loadConfig()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const logger = createLogger(config)

let db: Database
try {
  db = await openDatabase(config.database)
  const applied = await migrate(db)
  if (applied.length > 0) {
    logger.info({ migrations: applied }, "Updated the database")
  }
} catch (err) {
  logger.fatal({ err }, "Couldn't open the database")
  process.exit(1)
}
logger.info(
  config.database.kind === "sqlite"
    ? `Using SQLite at ${config.database.file}`
    : "Using Postgres"
)

const app = createApp({ config, logger, db })

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`Merran ${config.version} is listening on port ${info.port}`)
})

function shutDown(signal: NodeJS.Signals) {
  logger.info(`${signal}: shutting down`)
  server.close(() => {
    void db.close().finally(() => process.exit(0))
  })
  // Don't wait forever on open connections.
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.once("SIGINT", shutDown)
process.once("SIGTERM", shutDown)
