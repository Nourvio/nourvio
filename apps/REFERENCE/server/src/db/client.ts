import { sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import pg from "pg"

import * as schema from "./schema.ts"

export type Db = NodePgDatabase<typeof schema>

export function createDb(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
  })
  // An idle client can drop (e.g. Postgres restarting); log it instead of crashing.
  pool.on("error", (error) => console.error("Postgres pool error:", error))

  const db: Db = drizzle({ client: pool, schema, casing: "snake_case" })
  return { db, close: () => pool.end() }
}

export async function pingDatabase(db: Db) {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

/** Waits for Postgres to accept connections, e.g. while its container is still starting. */
export async function waitForDatabase(db: Db, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (!(await pingDatabase(db))) {
    if (Date.now() > deadline) {
      throw new Error("Couldn't connect to Postgres. Check DATABASE_URL.")
    }
    console.log("Waiting for Postgres...")
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}
