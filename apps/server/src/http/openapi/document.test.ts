import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { createTestApp, TestClient } from "../../test/app.ts"
import { createOpenApiFile } from "./file.ts"

let app: App
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, close } = await createTestApp())
})

afterAll(() => close())

describe("the API reference", () => {
  test("the saved openapi.json is up to date", async () => {
    // If this fails, the API changed: run `pnpm openapi` and commit the file.
    const saved = readFileSync(
      new URL("./openapi.json", import.meta.url),
      "utf8"
    )
    expect(saved).toBe(await createOpenApiFile())
  })

  test("includes signing in, and nothing of Better Auth's that's shut", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as {
      paths: Record<string, unknown>
    }
    const paths = Object.keys(spec.paths)

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/auth/sign-in/username",
        "/api/auth/sign-out",
        "/api/auth/organization/set-active",
      ])
    )
    expect(paths.filter((path) => path.includes("/admin/"))).toEqual([])
    expect(paths).not.toContain("/api/auth/organization/delete")
  })
})

describe("Better Auth endpoints Merran doesn't use", () => {
  test.each([
    ["POST", "/api/auth/organization/delete"],
    ["POST", "/api/auth/organization/update-member-role"],
    ["POST", "/api/auth/organization/invite-member"],
    ["GET", "/api/auth/admin/list-users"],
    ["POST", "/api/auth/admin/impersonate-user"],
    ["POST", "/api/auth/sign-up/email"],
    ["GET", "/api/auth/open-api/generate-schema"],
    ["GET", "/api/auth/reference"],
  ])("%s %s isn't there", async (method, path) => {
    const body = method === "GET" ? undefined : {}
    const res = await new TestClient(app).request(method, path, body)

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } })
  })
})
