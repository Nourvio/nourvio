import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestApp } from "../test/helpers.ts"
import { STORE_SECTIONS, UNITS } from "./reference-data.ts"
import { storeSections, units } from "./schema.ts"
import { seedReferenceData } from "./seed.ts"

describe("database", () => {
  let test_: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    test_ = await createTestApp()
  })
  afterAll(() => test_.close())

  test("seeds units and store sections, and seeding again changes nothing", async () => {
    await seedReferenceData(test_.db)
    expect(await test_.db.$count(units)).toBe(UNITS.length)
    expect(await test_.db.$count(storeSections)).toBe(STORE_SECTIONS.length)

    const [cup] = await test_.db
      .select()
      .from(units)
      .where(sql`${units.id} = 'cup'`)
    expect(cup).toMatchObject({ kind: "volume", abbreviation: "c" })
  })

  test("has pg_trgm for fuzzy matching", async () => {
    const result = await test_.db.execute(
      sql`select similarity('yellow onion', 'yellow onions') as score`
    )
    const score = Number((result.rows[0] as { score: number }).score)
    expect(score).toBeGreaterThan(0.6)
  })

  test("reports a healthy database", async () => {
    const res = await apiClient(test_.app).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: "ok", database: "ok" })
  })
})
