import { afterAll, beforeAll, expect, test } from "vitest"
import { createTestDatabase, testDatabaseKind } from "../test/database.ts"
import type { Database } from "./orm.ts"

let db: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await createTestDatabase())
})

afterAll(() => close())

test(`the ${testDatabaseKind} migrations build exactly what the entities describe`, async () => {
  // If this fails, an entity changed without a migration: run `pnpm db:migration`.
  const missing = await db.schema.getUpdateSchemaSQL({ wrap: false })

  expect(missing.trim()).toBe("")
})
