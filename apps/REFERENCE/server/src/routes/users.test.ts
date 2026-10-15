import { afterEach, describe, expect, test } from "vitest"

import { ADMIN, apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const MEMBER = {
  displayName: "Sam",
  username: "sam",
  password: "another long password",
}

let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  close = undefined
})

async function withMember() {
  const t = await createTestAppWithAdmin()
  close = t.close
  const created = await t.admin.post("/api/users", MEMBER)
  const member = apiClient(t.app)
  await member.post("/api/auth/login", {
    username: MEMBER.username,
    password: MEMBER.password,
  })
  return { ...t, created, member, memberId: created.body.user.id as string }
}

describe("household members", () => {
  test("an admin can add a member, who can then sign in", async () => {
    const t = await withMember()
    expect(t.created.status).toBe(201)
    expect(t.created.body.user).toMatchObject({
      username: "sam",
      role: "member",
    })
    expect((await t.member.get("/api/auth/me")).body.user.username).toBe("sam")

    const list = await t.admin.get("/api/users")
    expect(
      list.body.users.map((u: { username: string }) => u.username)
    ).toEqual(["kyle", "sam"])

    const duplicate = await t.admin.post("/api/users", MEMBER)
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.fields.username).toBeTruthy()
  })

  test("members can't manage the household", async () => {
    const t = await withMember()
    expect((await t.member.get("/api/users")).status).toBe(403)
    expect(
      (await t.member.post("/api/users", { ...MEMBER, username: "other" }))
        .status
    ).toBe(403)
  })

  test("removing a member signs them out", async () => {
    const t = await withMember()
    expect((await t.admin.delete(`/api/users/${t.memberId}`)).status).toBe(204)
    expect((await t.member.get("/api/auth/me")).status).toBe(401)
    expect((await t.admin.delete(`/api/users/${t.memberId}`)).status).toBe(404)
    expect((await t.admin.delete("/api/users/not-a-uuid")).status).toBe(404)
  })

  test("the last admin can't be removed or demoted", async () => {
    const t = await withMember()
    const self = t.adminUser.id as string
    expect((await t.admin.delete(`/api/users/${self}`)).status).toBe(400)
    const demote = await t.admin.patch(`/api/users/${self}`, { role: "member" })
    expect(demote.status).toBe(400)
    expect(demote.body.error).toMatch(/at least one admin/)

    // With a second admin, demoting the first is fine.
    await t.admin.patch(`/api/users/${t.memberId}`, { role: "admin" })
    expect(
      (await t.admin.patch(`/api/users/${self}`, { role: "member" })).status
    ).toBe(200)
  })

  test("an admin can reset a member's password, which signs them out", async () => {
    const t = await withMember()
    const res = await t.admin.patch(`/api/users/${t.memberId}`, {
      password: "a brand new password",
    })
    expect(res.status).toBe(200)
    expect((await t.member.get("/api/auth/me")).status).toBe(401)
    const login = await apiClient(t.app).post("/api/auth/login", {
      username: MEMBER.username,
      password: "a brand new password",
    })
    expect(login.status).toBe(200)
  })
})

describe("your own account", () => {
  test("saves your name and appearance", async () => {
    const t = await withMember()
    const res = await t.member.patch("/api/me", {
      displayName: "Samantha",
      appearance: { mode: "dark", palette: "paprika" },
    })
    expect(res.status).toBe(200)
    const me = (await t.member.get("/api/auth/me")).body.user
    expect(me.displayName).toBe("Samantha")
    expect(me.appearance).toEqual({ mode: "dark", palette: "paprika" })

    const bad = await t.member.patch("/api/me", {
      appearance: { mode: "dark", palette: "neon" },
    })
    expect(bad.status).toBe(400)
  })

  test("changing your password needs the current one and signs out other devices", async () => {
    const t = await createTestAppWithAdmin()
    close = t.close
    const otherDevice = apiClient(t.app)
    await otherDevice.post("/api/auth/login", {
      username: ADMIN.username,
      password: ADMIN.password,
    })

    const wrong = await t.admin.post("/api/me/password", {
      currentPassword: "not it",
      newPassword: "a brand new password",
    })
    expect(wrong.status).toBe(400)
    expect(wrong.body.fields.currentPassword).toBeTruthy()

    const ok = await t.admin.post("/api/me/password", {
      currentPassword: ADMIN.password,
      newPassword: "a brand new password",
    })
    expect(ok.status).toBe(204)
    expect((await t.admin.get("/api/auth/me")).status).toBe(200)
    expect((await otherDevice.get("/api/auth/me")).status).toBe(401)
  })
})
