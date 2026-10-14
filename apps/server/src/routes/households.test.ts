import { eq } from "drizzle-orm"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { invites } from "../db/schema.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const SOUP = {
  name: "Tomato Soup",
  tags: ["Soup"],
  ingredients: ["1 can tomatoes"],
  steps: ["Heat it."],
}

describe("households", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  /** Someone from another household, who signed up on their own. */
  let neighbor: ReturnType<typeof apiClient>
  let soup: { id: string; slug: string; imageUrl: string; thumbnailUrl: string }

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const created = await t.admin.post("/api/recipes", SOUP)
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#c33" },
    })
      .png()
      .toBuffer()
    const withPhoto = await t.admin.upload(
      `/api/recipes/${created.body.recipe.id}/image`,
      "image",
      new File([new Uint8Array(png)], "soup.png", { type: "image/png" })
    )
    soup = withPhoto.body.recipe
  })
  afterAll(() => t.close())

  describe("open sign-up", () => {
    const NEIGHBOR = {
      displayName: "Dana",
      username: "dana",
      password: "a long enough password",
      householdName: "Next Door",
    }

    test("is off unless the server admin turns it on", async () => {
      const closed = await apiClient(t.app).post("/api/signup", NEIGHBOR)
      expect(closed.status).toBe(403)

      const res = await t.admin.put("/api/server/settings", {
        signupOpen: true,
      })
      expect(res.body).toEqual({ signupOpen: true })
      expect((await t.admin.get("/api/setup/status")).body.signupOpen).toBe(
        true
      )
    })

    test("creates a new household with the person as its admin", async () => {
      neighbor = apiClient(t.app)
      const res = await neighbor.post("/api/signup", NEIGHBOR)
      expect(res.status).toBe(201)
      expect(res.body.user).toMatchObject({
        username: "dana",
        role: "admin",
        isServerAdmin: false,
      })
      expect(res.body.user.householdId).not.toBe(t.adminUser.householdId)
      expect(
        (await neighbor.get("/api/household")).body.household
      ).toMatchObject({
        name: "Next Door",
      })
      // Signed straight in.
      expect((await neighbor.get("/api/auth/me")).body.user.username).toBe(
        "dana"
      )
    })

    test("refuses a username that's taken anywhere on the server", async () => {
      const res = await apiClient(t.app).post("/api/signup", {
        ...NEIGHBOR,
        username: "kyle",
        householdName: "Imposters",
      })
      expect(res.status).toBe(409)
      const names = (
        await t.admin.get("/api/server/households")
      ).body.households.map((h: { name: string }) => h.name)
      expect(names).not.toContain("Imposters")
    })
  })

  describe("keep to themselves", () => {
    test("recipes, photos and tags", async () => {
      expect((await neighbor.get("/api/recipes")).body.recipes).toEqual([])
      expect((await neighbor.get(`/api/recipes/${soup.slug}`)).status).toBe(404)
      expect((await neighbor.get(`/api/recipes/${soup.id}`)).status).toBe(404)
      expect((await neighbor.put(`/api/recipes/${soup.id}`, SOUP)).status).toBe(
        404
      )
      expect((await neighbor.delete(`/api/recipes/${soup.id}`)).status).toBe(
        404
      )
      expect((await neighbor.get("/api/recipes/tags")).body.tags).toEqual([])
      expect((await neighbor.raw(soup.imageUrl)).status).toBe(404)
      expect((await neighbor.raw(soup.thumbnailUrl)).status).toBe(404)
      expect((await t.admin.raw(soup.imageUrl)).status).toBe(200)
      expect((await t.admin.raw(soup.thumbnailUrl)).status).toBe(200)
    })

    test("notes left after cooking", async () => {
      const added = await t.admin.post(`/api/recipes/${soup.id}/cook-notes`, {
        rating: 4,
        note: null,
      })
      expect(added.status).toBe(201)
      expect(
        (await neighbor.get(`/api/recipes/${soup.id}/cook-notes`)).status
      ).toBe(404)
      expect(
        (
          await neighbor.post(`/api/recipes/${soup.id}/cook-notes`, {
            rating: 1,
            note: null,
          })
        ).status
      ).toBe(404)
      expect(
        (
          await neighbor.delete(
            `/api/recipes/${soup.id}/cook-notes/${added.body.note.id}`
          )
        ).status
      ).toBe(404)
      expect(
        (await t.admin.get(`/api/recipes/${soup.id}/cook-notes`)).body.notes
      ).toHaveLength(1)
    })

    test("each household has its own slugs and tag spellings", async () => {
      const theirs = await neighbor.post("/api/recipes", {
        ...SOUP,
        tags: ["soup"],
      })
      expect(theirs.body.recipe.slug).toBe("tomato-soup")
      expect(theirs.body.recipe.tags).toEqual(["soup"])
      const ours = (await t.admin.get("/api/recipes/tomato-soup")).body.recipe
      expect(ours.id).toBe(soup.id)
      expect(ours.tags).toEqual(["Soup"])
    })

    test("people", async () => {
      const ours = (await t.admin.get("/api/users")).body.users
      expect(ours.map((u: { username: string }) => u.username)).toEqual([
        "kyle",
      ])
      const kyle = ours[0]
      expect(
        (
          await neighbor.patch(`/api/users/${kyle.id}`, {
            displayName: "Hacked",
          })
        ).status
      ).toBe(404)
      expect((await neighbor.delete(`/api/users/${kyle.id}`)).status).toBe(404)
    })
  })

  describe("invite links", () => {
    let token: string

    test("an admin makes one; a member can't", async () => {
      const res = await t.admin.post("/api/household/invites", {})
      expect(res.status).toBe(201)
      expect(res.body.invite).toMatchObject({
        role: "member",
        createdBy: "Kyle",
      })
      token = res.body.invite.token
      expect(token.length).toBeGreaterThan(30)

      const listed = (await t.admin.get("/api/household/invites")).body.invites
      expect(listed).toHaveLength(1)
      expect(listed[0].token).toBeUndefined()
    })

    test("shows who's inviting before joining", async () => {
      const res = await apiClient(t.app).get(`/api/join/${token}`)
      expect(res.body.invite).toMatchObject({
        householdName: "The Kitchen",
        invitedBy: "Kyle",
        role: "member",
      })
      expect((await apiClient(t.app).get("/api/join/nope")).status).toBe(404)
    })

    test("joins the household, once", async () => {
      const taken = await apiClient(t.app).post(`/api/join/${token}`, {
        displayName: "Sam",
        username: "dana",
        password: "another long password",
      })
      expect(taken.status).toBe(409)

      // The link still works after a failed try.
      const sam = apiClient(t.app)
      const res = await sam.post(`/api/join/${token}`, {
        displayName: "Sam",
        username: "sam",
        password: "another long password",
      })
      expect(res.status).toBe(201)
      expect(res.body.user).toMatchObject({
        role: "member",
        householdId: t.adminUser.householdId,
        isServerAdmin: false,
      })
      expect((await sam.get(`/api/recipes/${soup.slug}`)).status).toBe(200)

      const again = await apiClient(t.app).post(`/api/join/${token}`, {
        displayName: "Pat",
        username: "pat",
        password: "another long password",
      })
      expect(again.status).toBe(410)
      expect(
        (await t.admin.get("/api/household/invites")).body.invites
      ).toEqual([])

      // Members can't invite or rename the household.
      expect((await sam.post("/api/household/invites", {})).status).toBe(403)
      expect(
        (await sam.patch("/api/household", { name: "Sam's" })).status
      ).toBe(403)
    })

    test("expire, and can be revoked", async () => {
      const old = (await t.admin.post("/api/household/invites", {})).body.invite
      await t.db
        .update(invites)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invites.id, old.id))
      expect(
        (await apiClient(t.app).get(`/api/join/${old.token}`)).status
      ).toBe(410)

      const revoked = (
        await t.admin.post("/api/household/invites", { role: "admin" })
      ).body.invite
      expect(revoked.role).toBe("admin")
      // Another household's admin can't revoke it.
      await neighbor.delete(`/api/household/invites/${revoked.id}`)
      expect(
        (await apiClient(t.app).get(`/api/join/${revoked.token}`)).status
      ).toBe(200)
      await t.admin.delete(`/api/household/invites/${revoked.id}`)
      expect(
        (await apiClient(t.app).get(`/api/join/${revoked.token}`)).status
      ).toBe(404)
    })
  })

  describe("the server admin", () => {
    test("is the only one who runs the server", async () => {
      expect((await neighbor.get("/api/server/households")).status).toBe(403)
      expect(
        (await neighbor.put("/api/server/settings", { signupOpen: false }))
          .status
      ).toBe(403)
      expect((await neighbor.get("/api/ai/settings")).status).toBe(403)
      expect(
        (
          await neighbor.post("/api/import/mealie/check", {
            url: "http://192.168.1.20:9000",
            token: "a-mealie-token-123",
          })
        ).status
      ).toBe(403)
      // But every household admin tidies their own library.
      expect((await neighbor.get("/api/ai/cleanup-job")).status).toBe(200)
    })

    test("sees every household", async () => {
      const { households } = (await t.admin.get("/api/server/households")).body
      expect(households).toEqual([
        expect.objectContaining({
          name: "The Kitchen",
          members: 2,
          recipes: 1,
          isYours: true,
        }),
        expect.objectContaining({
          name: "Next Door",
          members: 1,
          recipes: 1,
          isYours: false,
        }),
      ])
    })

    test("can remove another household, with everything in it", async () => {
      const { households } = (await t.admin.get("/api/server/households")).body
      const nextDoor = households.find(
        (h: { name: string }) => h.name === "Next Door"
      )
      const ours = households.find((h: { isYours: boolean }) => h.isYours)
      expect(
        (await t.admin.delete(`/api/server/households/${ours.id}`)).status
      ).toBe(400)

      expect(
        (await t.admin.delete(`/api/server/households/${nextDoor.id}`)).status
      ).toBe(204)
      expect((await neighbor.get("/api/auth/me")).status).toBe(401)
      const left = (await t.admin.get("/api/server/households")).body.households
      expect(left.map((h: { name: string }) => h.name)).toEqual(["The Kitchen"])
      // Our recipe is untouched.
      expect((await t.admin.get(`/api/recipes/${soup.id}`)).status).toBe(200)
    })
  })

  test("an admin renames the household", async () => {
    const res = await t.admin.patch("/api/household", {
      name: "Johnson Kitchen",
    })
    expect(res.body.household.name).toBe("Johnson Kitchen")
  })
})
