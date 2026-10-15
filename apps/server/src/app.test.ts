import { pino } from "pino"
import { describe, expect, test } from "vitest"
import { createApp } from "./app.ts"
import { loadConfig } from "./config.ts"

function testApp() {
  return createApp({
    config: loadConfig({}),
    logger: pino({ level: "silent" }),
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
