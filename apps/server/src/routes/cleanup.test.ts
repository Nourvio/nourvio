import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { HttpError } from "../http.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const CHILI = {
  name: "Weeknight Chili",
  servings: 6,
  totalMinutes: null,
  tags: ["Beef"],
  ingredients: ["1 lb ground beef", "salt and pepper"],
  steps: ["Brown the beef. Then add everything else and simmer it. Enjoy!"],
}

type CleanupAnswer = {
  description: string | null
  tags: string[] | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  ingredients: string[] | null
  steps: string[] | null
  summary: string
}

const TIDY: CleanupAnswer = {
  description: "A quick beef chili for busy nights.",
  tags: ["beef", "chili", "weeknight"],
  servings: 4, // already set to 6: must be ignored
  prepMinutes: 10,
  cookMinutes: 30,
  totalMinutes: 40,
  ingredients: ["1 lb ground beef", "salt", "pepper"],
  steps: [], // empty: must not wipe the steps
  summary: "Split salt and pepper, added a description and tags.",
}

const NOTHING: CleanupAnswer = {
  description: null,
  tags: null,
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  ingredients: null,
  steps: null,
  summary: "Already tidy.",
}

async function until<T>(check: () => Promise<T | undefined | null | false>) {
  for (let i = 0; i < 100; i++) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("Timed out waiting")
}

describe("tidying up recipes", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ai = {
    answer: TIDY as CleanupAnswer | Error,
    systems: [] as string[],
  }

  const aiFactory: AiProviderFactory = (id) => ({
    id,
    async extract(request) {
      if (request.schemaName !== "cleanup") {
        return {
          data: {
            found: true,
            name: "Pasted Soup",
            description: null,
            servings: null,
            yieldText: null,
            prepMinutes: null,
            cookMinutes: null,
            totalMinutes: null,
            ingredients: ["1 onion"],
            steps: ["Make soup."],
            tags: [],
            notes: null,
          } as never,
          usage: { inputTokens: 10, outputTokens: 10 },
        }
      }
      ai.systems.push(request.system)
      if (ai.answer instanceof Error) throw ai.answer
      return {
        data: ai.answer as never,
        usage: { inputTokens: 800, outputTokens: 150 },
      }
    },
    async listModels() {
      return []
    },
  })

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory })
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    await t.admin.post("/api/recipes", {
      ...CHILI,
      name: "Weeknight Pasta",
      tags: ["weeknight"],
    })
  })
  afterAll(() => t.close())

  async function newChili(name = CHILI.name) {
    return (await t.admin.post("/api/recipes", { ...CHILI, name })).body.recipe
  }

  test("suggests changes without touching the recipe", async () => {
    const chili = await newChili()
    const res = await t.admin.post(`/api/recipes/${chili.id}/cleanup`, {})
    expect(res.status).toBe(200)
    const proposal = res.body.proposal
    expect(proposal.summary).toMatch(/Split salt and pepper/)
    expect(Object.keys(proposal.after).sort()).toEqual([
      "description",
      "details",
      "ingredients",
      "tags",
    ])
    expect(proposal.before.ingredients).toEqual(CHILI.ingredients)
    expect(proposal.after.ingredients).toEqual([
      "1 lb ground beef",
      "salt",
      "pepper",
    ])
    // Only missing details are filled in.
    expect(proposal.after.details).toEqual({
      servings: 6,
      prepMinutes: 10,
      cookMinutes: 30,
      totalMinutes: 40,
    })
    // Existing tags are offered to the AI, to avoid near-duplicates.
    expect(ai.systems.at(-1)).toContain("weeknight")

    const unchanged = (await t.admin.get(`/api/recipes/${chili.id}`)).body
      .recipe
    expect(unchanged.ingredients).toHaveLength(2)
    const pending = await t.admin.get(`/api/recipes/${chili.id}/proposal`)
    expect(pending.body.proposal.id).toBe(proposal.id)
    expect((await t.admin.get("/api/proposals")).body.proposals.length).toBe(1)
  })

  test("applies only the chosen sections, with a version to go back to", async () => {
    const chili = await newChili("Chili Two")
    const { proposal } = (
      await t.admin.post(`/api/recipes/${chili.id}/cleanup`, {})
    ).body
    const res = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {
      sections: ["ingredients", "tags"],
    })
    expect(res.status).toBe(200)
    expect(
      res.body.recipe.ingredients.map((i: { text: string }) => i.text)
    ).toEqual(["1 lb ground beef", "salt", "pepper"])
    // Tags are shared, so an existing tag keeps its spelling ("Beef").
    expect(
      res.body.recipe.tags.map((tag: string) => tag.toLowerCase())
    ).toEqual(["beef", "chili", "weeknight"])
    expect(res.body.recipe.description).toBeNull()

    const versions = (await t.admin.get(`/api/recipes/${chili.id}/versions`))
      .body.versions
    expect(versions[0].source).toBe("ai_cleanup")
    expect(
      (await t.admin.get(`/api/recipes/${chili.id}/proposal`)).body.proposal
    ).toBeNull()
    expect(
      (
        await t.admin.post(`/api/proposals/${proposal.id}/apply`, {
          sections: ["steps"],
        })
      ).status
    ).toBe(409)
  })

  test("won't overwrite a section edited since", async () => {
    const chili = await newChili("Chili Three")
    const { proposal } = (
      await t.admin.post(`/api/recipes/${chili.id}/cleanup`, {})
    ).body
    await t.admin.put(`/api/recipes/${chili.id}`, {
      ...CHILI,
      name: "Chili Three",
      ingredients: ["2 lb ground beef"],
    })
    const stale = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {
      sections: ["ingredients"],
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatch(/^Ingredients changed since/)
    // Sections nobody touched still apply.
    const ok = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {
      sections: ["description"],
    })
    expect(ok.status).toBe(200)
    expect(ok.body.recipe.description).toBe(TIDY.description)
  })

  test("can be dismissed", async () => {
    const chili = await newChili("Chili Four")
    const { proposal } = (
      await t.admin.post(`/api/recipes/${chili.id}/cleanup`, {
        sections: ["tags"],
      })
    ).body
    expect(Object.keys(proposal.after)).toEqual(["tags"])
    const res = await t.admin.post(`/api/proposals/${proposal.id}/dismiss`)
    expect(res.status).toBe(204)
    expect(
      (await t.admin.get(`/api/recipes/${chili.id}/proposal`)).body.proposal
    ).toBeNull()
  })

  test("says so when there's nothing to change", async () => {
    ai.answer = NOTHING
    const chili = await newChili("Chili Five")
    const res = await t.admin.post(`/api/recipes/${chili.id}/cleanup`, {})
    expect(res.body.proposal).toBeNull()
    ai.answer = TIDY
  })

  test("tidies the whole library in the background", async () => {
    const before = (await t.admin.get("/api/ai/settings/cleanup-job")).body
    // "Weeknight Pasta" is the only recipe never tidied.
    expect(before.untidied).toBe(1)

    const started = await t.admin.post("/api/ai/settings/cleanup-job")
    expect(started.status).toBe(201)
    const job = await until(async () => {
      const { job } = (await t.admin.get("/api/ai/settings/cleanup-job")).body
      return job.status !== "running" && job
    })
    expect(job).toMatchObject({
      status: "done",
      total: 1,
      done: 1,
      failed: 0,
      proposals: 1,
    })

    const again = await t.admin.post("/api/ai/settings/cleanup-job")
    expect(again.status).toBe(400)
  })

  test("stops a run when the AI keeps failing", async () => {
    for (const name of ["Soup A", "Soup B", "Soup C", "Soup D", "Soup E"]) {
      await newChili(name)
    }
    ai.answer = new HttpError(502, "Claude didn't accept the API key")
    await t.admin.post("/api/ai/settings/cleanup-job")
    const job = await until(async () => {
      const { job } = (await t.admin.get("/api/ai/settings/cleanup-job")).body
      return job.status !== "running" && job
    })
    expect(job.status).toBe("failed")
    expect(job.failed).toBeGreaterThanOrEqual(3)
    expect(job.done).toBe(0)
    ai.answer = TIDY
  })

  test("only admins start a library run", async () => {
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "another long password",
    })
    const member = apiClient(t.app)
    await member.post("/api/auth/login", {
      username: "sam",
      password: "another long password",
    })
    expect((await member.post("/api/ai/settings/cleanup-job")).status).toBe(403)
    // But anyone can tidy a recipe.
    const chili = await newChili("Chili Six")
    expect(
      (await member.post(`/api/recipes/${chili.id}/cleanup`, {})).status
    ).toBe(200)
  })

  test("tidies new imports automatically when turned on", async () => {
    await t.admin.put("/api/ai/settings", { autoCleanup: true })
    const res = await t.admin.post("/api/import/text", {
      text: "Pasted soup: 1 onion. Make soup out of it.",
    })
    expect(res.status).toBe(201)
    const proposal = await until(
      async () =>
        (await t.admin.get(`/api/recipes/${res.body.recipe.id}/proposal`)).body
          .proposal
    )
    expect(proposal.recipe.slug).toBe("pasted-soup")
  })
})
