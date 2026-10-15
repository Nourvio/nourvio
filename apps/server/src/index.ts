import { serve } from "@hono/node-server"
import { createApp } from "./app.ts"
import { loadConfig, type Config } from "./config.ts"
import { createLogger } from "./logger.ts"

let config: Config
try {
  config = loadConfig()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const logger = createLogger(config)
const app = createApp({ config, logger })

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`Merran ${config.version} is listening on port ${info.port}`)
})

function shutDown(signal: NodeJS.Signals) {
  logger.info(`${signal}: shutting down`)
  server.close(() => process.exit(0))
  // Don't wait forever on open connections.
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.once("SIGINT", shutDown)
process.once("SIGTERM", shutDown)
