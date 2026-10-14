import { afterEach, describe, expect, test } from "vitest"

import {
  ADMIN,
  apiClient,
  createTestApp,
  createTestAppWithAdmin,
} from "../test/helpers.ts"

let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  close = undefined
})

describe("first-run setup", () => {
  test("needs setup until the first account exists, and checks the code", async () => {
    const t = await createTestApp()
    close = t.close
    const api = apiClient(t.app)

    expect((await api.get("/api/setup/status")).body).toEqual({
      needsSetup: true,
      signupOpen: false,
    })

    const wrongCode = await api.post("/api/setup", {
      ...ADMIN,
      code: "AAAA-BBBB-CCCC",
    })
    expect(wrongCode.status).toBe(403)
    expect(wrongCode.body.fields.code).toBeTruthy()

    // The code works in any case and with or without dashes.
    const res = await api.post("/api/setup", {
      ...ADMIN,
      username: "Kyle",
      code: t.code.toLowerCase().replaceAll("-", ""),
    })
    expect(res.status).toBe(201)
    // The first person runs the server and is admin of the first household.
    expect(res.body.user).toMatchObject({
      username: "kyle",
      role: "admin",
      isServerAdmin: true,
    })
    expect(res.body.user.passwordHash).toBeUndefined()

    expect((await api.get("/api/auth/me")).body.user.username).toBe("kyle")
    expect((await api.get("/api/setup/status")).body).toEqual({
      needsSetup: false,
      signupOpen: false,
    })

    const again = await apiClient(t.app).post("/api/setup", {
      ...ADMIN,
      username: "someone",
      code: t.code,
    })
    expect(again.status).toBe(409)
  })

  test("rejects a weak password with a message for that field", async () => {
    const t = await createTestApp()
    close = t.close
    const res = await apiClient(t.app).post("/api/setup", {
      ...ADMIN,
      password: "short",
      code: t.code,
    })
    expect(res.status).toBe(400)
    expect(res.body.fields.password).toMatch(/at least 10/)
  })
})

describe("signing in", () => {
  test("accepts the right password and refuses the wrong one", async () => {
    const t = await createTestAppWithAdmin()
    close = t.close
    const api = apiClient(t.app)

    const wrong = await api.post("/api/auth/login", {
      username: ADMIN.username,
      password: "not the password",
    })
    const unknown = await api.post("/api/auth/login", {
      username: "nobody",
      password: "not the password",
    })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(unknown.body.error).toBe(wrong.body.error)
    expect(api.signedIn).toBe(false)

    const ok = await api.post("/api/auth/login", {
      username: "KYLE",
      password: ADMIN.password,
    })
    expect(ok.status).toBe(200)
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i)
    expect((await api.get("/api/auth/me")).status).toBe(200)
  })

  test("locks a username after 5 failed attempts", async () => {
    const t = await createTestAppWithAdmin()
    close = t.close
    const api = apiClient(t.app)
    for (let i = 0; i < 5; i++) {
      await api.post("/api/auth/login", {
        username: ADMIN.username,
        password: "wrong password",
      })
    }
    const locked = await api.post("/api/auth/login", {
      username: ADMIN.username,
      password: ADMIN.password,
    })
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0)
  })

  test("signing out ends the session", async () => {
    const t = await createTestAppWithAdmin()
    close = t.close
    expect((await t.admin.post("/api/auth/logout")).status).toBe(204)
    expect((await t.admin.get("/api/auth/me")).status).toBe(401)
  })

  test("everything except health, setup and login needs a session", async () => {
    const t = await createTestApp()
    close = t.close
    const api = apiClient(t.app)
    expect((await api.get("/api/auth/me")).status).toBe(401)
    expect((await api.get("/api/users")).status).toBe(401)
    expect((await api.patch("/api/me", { displayName: "x" })).status).toBe(401)
    expect((await api.get("/api/anything-else")).status).toBe(401)
  })

  test("refuses form posts from another site", async () => {
    const t = await createTestApp()
    close = t.close
    const res = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://evil.example",
      },
      body: "username=kyle&password=x",
    })
    expect(res.status).toBe(403)
  })
})
