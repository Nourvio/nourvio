import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "../../core/context.ts"
import type { Database } from "../../db/orm.ts"

/** Each request gets its own entity manager, so nothing leaks between them. */
export function entityManager(db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("em", db.em.fork())
    await next()
  }
}
