import pg from "pg"

import { config } from "./config.ts"

let pool: pg.Pool | undefined

function getPool() {
  if (!config.databaseUrl) return undefined
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 3000,
    })
    // An idle client can drop (e.g. Postgres restarting); log it instead of crashing.
    pool.on("error", (error) => console.error("Postgres pool error:", error))
  }
  return pool
}

export type DatabaseStatus = "ok" | "unavailable" | "not configured"

export async function checkDatabase(): Promise<DatabaseStatus> {
  const db = getPool()
  if (!db) return "not configured"
  try {
    await db.query("select 1")
    return "ok"
  } catch {
    return "unavailable"
  }
}

export async function closeDatabase() {
  await pool?.end()
}
