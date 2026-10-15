import { pino } from "pino"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createApp } from "./app.ts"
import { loadConfig } from "./core/config.ts"
import type { Database } from "./db/orm.ts"
import { createTestDatabase, testDatabaseKind } from "./test/database.ts"

let db: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await createTestDatabase())
})

afterAll(() => close())

function testApp() {
  const config = loadConfig({})
  return createApp({
    config: {
      ...config,
      database:
        testDatabaseKind === "postgres"
          ? { kind: "postgres", url: "postgres://test" }
          : config.database,
    },
    logger: pino({ level: "silent" }),
    db,
  })
}

describe("the app", () => {
  test("health says the server is up, with its version", async () => {
    const res = await testApp().request("/api/v1/health")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: "ok",
      version: expect.any(String),
    })
  })

  test("ready says the database answers and is up to date", async () => {
    const res = await testApp().request("/api/v1/health/ready")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: "ready",
      database: testDatabaseKind,
    })
  })

  test("every response carries a request id", async () => {
    const res = await testApp().request("/api/v1/health")

    expect(res.headers.get("x-request-id")).toBeTruthy()
  })

  test("an unknown address gets the standard error", async () => {
    const res = await testApp().request("/api/v1/nothing-here")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: expect.any(String) },
    })
  })

  test("the OpenAPI spec lists the routes and the error shape", async () => {
    const res = await testApp().request("/api/v1/openapi.json")
    const spec = (await res.json()) as {
      openapi: string
      paths: Record<string, unknown>
      components: { schemas: Record<string, unknown> }
    }

    expect(spec.openapi).toBe("3.1.0")
    expect(spec.paths).toHaveProperty("/api/v1/health")
    expect(spec.components.schemas).toHaveProperty("Error")
  })

  test("the API reference page is served", async () => {
    const res = await testApp().request("/api/docs")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
  })
})
