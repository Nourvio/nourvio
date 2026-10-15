import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, expect, test } from "vitest"

import { migrationsFolder } from "./migrate.ts"

const dirs: string[] = []
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

/** The migrations folder as it was up to (but not including) `tag`. */
async function migrationsBefore(tag: string) {
  const dir = await mkdtemp(join(tmpdir(), "mise-migrations-"))
  dirs.push(dir)
  await cp(migrationsFolder, dir, { recursive: true })
  const journalPath = join(dir, "meta", "_journal.json")
  const journal = JSON.parse(await readFile(journalPath, "utf8"))
  const index = journal.entries.findIndex((e: { tag: string }) => e.tag === tag)
  journal.entries = journal.entries.slice(0, index)
  await writeFile(journalPath, JSON.stringify(journal))
  return dir
}

test("moving to households keeps an existing install's people and recipes together", async () => {
  const client = new PGlite({ extensions: { pg_trgm } })
  const db = drizzle({ client })

  // An install from before households, with an admin, a member and a recipe.
  await migrate(db, {
    migrationsFolder: await migrationsBefore("0006_households"),
  })
  await db.execute(sql`
    insert into users (username, display_name, password_hash, role) values
      ('kyle', 'Kyle', 'x', 'admin'),
      ('sam', 'Sam', 'x', 'member')`)
  await db.execute(sql`
    insert into recipes (slug, name) values ('soup', 'Soup')`)
  await db.execute(sql`insert into tags (name) values ('Dinner')`)

  await migrate(db, { migrationsFolder })

  const households = (await db.execute(sql`select id, name from households`))
    .rows
  expect(households).toEqual([{ id: expect.any(String), name: "Home" }])
  const home = (households[0] as { id: string }).id

  const people = (
    await db.execute(
      sql`select username, household_id, is_server_admin from users order by username`
    )
  ).rows
  expect(people).toEqual([
    { username: "kyle", household_id: home, is_server_admin: true },
    { username: "sam", household_id: home, is_server_admin: false },
  ])
  expect(
    (await db.execute(sql`select household_id from recipes`)).rows
  ).toEqual([{ household_id: home }])
  expect((await db.execute(sql`select household_id from tags`)).rows).toEqual([
    { household_id: home },
  ])
  await client.close()
})

test("a new install starts with no households", async () => {
  const client = new PGlite({ extensions: { pg_trgm } })
  const db = drizzle({ client })
  await migrate(db, { migrationsFolder })
  expect(
    (await db.execute(sql`select count(*)::int as n from households`)).rows
  ).toEqual([{ n: 0 }])
  await client.close()
})
