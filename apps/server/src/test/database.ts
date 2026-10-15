import { migrate, openDatabase, type Database } from "../db/orm.ts"
import {
  DEFAULT_TEST_POSTGRES_URL,
  tempPostgresDatabase,
} from "../db/temp-postgres.ts"

/** Which database this test run uses: set per Vitest project. */
export const testDatabaseKind =
  process.env.MERRAN_TEST_DB === "postgres" ? "postgres" : "sqlite"

/**
 * A fresh, migrated database: SQLite in memory, or a new database on the
 * test Postgres server. Close it when the tests are done.
 */
export async function createTestDatabase(): Promise<{
  db: Database
  close: () => Promise<void>
}> {
  if (testDatabaseKind === "postgres") {
    const temp = await tempPostgresDatabase(
      process.env.MERRAN_TEST_POSTGRES_URL ?? DEFAULT_TEST_POSTGRES_URL
    )
    const db = await openDatabase({ kind: "postgres", url: temp.url })
    await migrate(db)
    return {
      db,
      close: async () => {
        await db.close()
        await temp.drop()
      },
    }
  }

  const db = await openDatabase({ kind: "sqlite", file: ":memory:" })
  await migrate(db)
  return { db, close: () => db.close() }
}
