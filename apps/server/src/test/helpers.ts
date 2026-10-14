import { PGlite } from "@electric-sql/pglite"
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

import { createApp } from "../app.ts"
import { SetupCode } from "../auth/setup-code.ts"
import type { Db } from "../db/client.ts"
import { migrationsFolder } from "../db/migrate.ts"
import * as schema from "../db/schema.ts"
import { seedReferenceData } from "../db/seed.ts"
import type { AiProviderFactory } from "../ai/types.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import type { VideoTools } from "../import/video-tools.ts"

type App = ReturnType<typeof createApp>

/** A fresh app on an in-memory Postgres (PGlite) with every migration applied. */
export async function createTestApp({
  fetcher,
  aiFactory,
  videoTools,
}: {
  fetcher?: Fetcher
  aiFactory?: AiProviderFactory
  videoTools?: VideoTools
} = {}) {
  const client = new PGlite({ extensions: { pg_trgm } })
  const pglite = drizzle({ client, schema, casing: "snake_case" })
  await migrate(pglite, { migrationsFolder })
  // Same query builder as node-postgres; only the driver underneath differs.
  const db = pglite as unknown as Db
  await seedReferenceData(db)

  const setupCode = new SetupCode()
  const code = setupCode.issue()
  const app = createApp({ db, setupCode, fetcher, aiFactory, videoTools })
  return { app, db, code, close: () => client.close() }
}

export type ApiResponse = {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  headers: Headers
}

/** Calls the app like a browser would, keeping the session cookie between requests. */
export function apiClient(app: App) {
  let cookie = ""

  async function request(method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) {
      const pair = setCookie.split(";")[0]!
      cookie = pair.endsWith("=") ? "" : pair
    }
    const text = await res.text()
    const response: ApiResponse = {
      status: res.status,
      body: text ? JSON.parse(text) : null,
      headers: res.headers,
    }
    return response
  }

  /** A multipart upload, the way the browser sends a file. */
  async function upload(path: string, field: string, file: File) {
    const form = new FormData()
    form.append(field, file)
    const res = await app.request(path, {
      method: "POST",
      headers: { origin: "http://localhost", ...(cookie ? { cookie } : {}) },
      body: form,
    })
    const text = await res.text()
    const response: ApiResponse = {
      status: res.status,
      body: text ? JSON.parse(text) : null,
      headers: res.headers,
    }
    return response
  }

  return {
    get: (path: string) => request("GET", path),
    post: (path: string, body?: unknown) => request("POST", path, body),
    put: (path: string, body?: unknown) => request("PUT", path, body),
    patch: (path: string, body?: unknown) => request("PATCH", path, body),
    delete: (path: string) => request("DELETE", path),
    upload,
    get signedIn() {
      return cookie !== ""
    },
  }
}

export const ADMIN = {
  displayName: "Kyle",
  username: "kyle",
  password: "correct horse battery",
}

/** A test app whose first account (an admin) is already set up and signed in. */
export async function createTestAppWithAdmin(
  options: Parameters<typeof createTestApp>[0] = {}
) {
  const test = await createTestApp(options)
  const admin = apiClient(test.app)
  const res = await admin.post("/api/setup", { ...ADMIN, code: test.code })
  if (res.status !== 201) throw new Error(`Setup failed: ${res.status}`)
  return { ...test, admin, adminUser: res.body.user }
}
