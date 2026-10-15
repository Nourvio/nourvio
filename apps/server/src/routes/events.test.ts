import type { HouseholdEvent } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

type Client = ReturnType<typeof apiClient>

/** Reads a page's live events as they come. */
async function listen(client: Client, path = "/api/events?page=list") {
  const res = await client.raw(path)
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toMatch(/text\/event-stream/)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const events: HouseholdEvent[] = []

  /** The next event that passes `test`, waiting up to a couple of seconds. */
  async function next(
    test: (event: HouseholdEvent) => boolean
  ): Promise<HouseholdEvent> {
    const found = events.find(test)
    if (found) {
      events.splice(events.indexOf(found), 1)
      return found
    }
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 2000)
        ),
      ])
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let end
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = chunk.match(/^data: (.*)$/m)?.[1]
        if (data) events.push(JSON.parse(data))
      }
      const match = events.find(test)
      if (match) {
        events.splice(events.indexOf(match), 1)
        return match
      }
    }
    throw new Error("No such event")
  }

  return { next, close: () => reader.cancel() }
}

describe("shopping together", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let jamie: Client
  let jamieId: string

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const invite = await t.admin.post("/api/household/invites", {
      role: "member",
    })
    jamie = apiClient(t.app)
    const joined = await jamie.post(`/api/join/${invite.body.invite.token}`, {
      displayName: "Jamie",
      username: "jamie",
      password: "correct horse battery",
    })
    jamieId = joined.body.user.id
  })
  afterAll(() => t.close())

  test("the list changes live, and says who else has it open", async () => {
    const mine = await listen(t.admin)
    expect(
      await mine.next((e) => e.type === "presence" && e.people.length === 1)
    ).toMatchObject({ people: [{ name: "Kyle" }] })

    const theirs = await listen(jamie)
    expect(
      await mine.next((e) => e.type === "presence" && e.people.length === 2)
    ).toMatchObject({
      page: "list",
      people: expect.arrayContaining([
        expect.objectContaining({ name: "Jamie" }),
      ]),
    })

    await jamie.post("/api/list/items", { text: "bananas" })
    expect(await mine.next((e) => e.type === "list")).toEqual({
      type: "list",
      by: jamieId,
    })

    // Only changes count.
    await jamie.get("/api/list")
    await t.admin.post("/api/list/items", { text: "milk" })
    // Everyone hears every change, their own included; the page skips its own.
    expect(
      await theirs.next((e) => e.type === "list" && e.by === t.adminUser.id)
    ).toEqual({
      type: "list",
      by: t.adminUser.id,
    })

    await theirs.close()
    expect(
      await mine.next((e) => e.type === "presence" && e.people.length === 1)
    ).toMatchObject({ people: [{ name: "Kyle" }] })
    await mine.close()
  })

  test("another household hears nothing", async () => {
    const other = await createTestAppWithAdmin()
    try {
      const mine = await listen(t.admin)
      await mine.next((e) => e.type === "presence")
      // Signed in elsewhere: a different app and household entirely.
      await other.admin.post("/api/list/items", { text: "eggs" })
      await expect(mine.next((e) => e.type === "list")).rejects.toThrow()
      await mine.close()
    } finally {
      await other.close()
    }
  })

  test("signed out, there's no stream", async () => {
    expect((await apiClient(t.app).raw("/api/events")).status).toBe(401)
  })
})
