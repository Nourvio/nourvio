import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import type { Database } from "../database/orm.ts"
import type { Config } from "./config.ts"

/** What the app is built from. Tests pass their own. */
export type AppDeps = {
  config: Config
  logger: Logger
  database: Database
}

/** Variables set on every request. `requestId` comes from Hono's middleware. */
export type AppEnv = {
  Variables: {
    /** The app's logger, tagged with this request's id. */
    logger: Logger
    /**
     * This request's own entity manager. It sees no household's rows until
     * scoped with `forHousehold()`.
     */
    em: EntityManager
  }
}
