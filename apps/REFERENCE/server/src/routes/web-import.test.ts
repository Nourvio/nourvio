import type { Household, Proposal, Recipe } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { Fetcher } from "../import/safe-fetch.ts"
import { createProposal } from "../services/proposals.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

const PAGE = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Birria de Res",
    recipeIngredient: ["3 lb beef chuck", "4 guajillo chiles"],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Braise until tender." },
    ],
  }
)}</script></head><body></body></html>`

const fetcher: Fetcher = async (url) => {
  if (url !== "https://www.seriouseats.com/birria-recipe") {
    throw new Error(`Unexpected fetch: ${url}`)
  }
  return { url, contentType: "text/html", body: Buffer.from(PAGE) }
}

describe("importing a recipe the assistant found", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let householdId: string

  const offer = async () =>
    createProposal(t.db, {
      householdId,
      kind: "import_link",
      recipeId: null,
      payload: {
        summary: "A great birria.",
        before: {},
        after: {},
        link: {
          url: "https://www.seriouseats.com/birria-recipe",
          title: "Birria de Res",
          site: "Serious Eats",
        },
      },
      userId: t.adminUser.id,
      conversationId: null,
    })

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ fetcher })
    householdId = (
      (await t.admin.get("/api/household")).body.household as Household
    ).id
  })
  afterAll(() => t.close())

  test("imports it like any link, with the card pointing to the recipe", async () => {
    const proposal = await offer()
    const res = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {})
    expect(res.status).toBe(200)
    const recipe = res.body.recipe as Recipe
    expect(recipe).toMatchObject({
      name: "Birria de Res",
      origin: "url",
      sourceUrl: "https://www.seriouseats.com/birria-recipe",
    })
    expect(res.body.proposal as Proposal).toMatchObject({
      status: "applied",
      result: { id: recipe.id },
    })
  })

  test("a second offer of the same link points at the one already there", async () => {
    const proposal = await offer()
    const res = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {})
    expect(res.status).toBe(200)
    const recipes = (await t.admin.get("/api/recipes")).body.recipes as Recipe[]
    expect(recipes.filter((r) => r.name === "Birria de Res")).toHaveLength(1)
  })
})
