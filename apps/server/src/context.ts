import type { Logger } from "pino"
import type { Config } from "./config.ts"

/** What the app is built from. Tests pass their own. */
export type AppDeps = {
  config: Config
  logger: Logger
}

/** Variables set on every request. `requestId` comes from Hono's middleware. */
export type AppEnv = {
  Variables: {
    /** The app's logger, tagged with this request's id. */
    logger: Logger
  }
}
