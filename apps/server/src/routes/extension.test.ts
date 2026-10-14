import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { ExtensionToken, Recipe } from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { config } from "../config.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Paywalled Pie",
  description: "Has </script> in it, which mustn't end the tag.",
  recipeIngredient: ["2 cups flour", "1 cup butter"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Bake it." }],
  image: "https://cdn.example/pie.jpg",
}

describe("the browser extension", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let token: string
  const fetched: string[] = []

  /** Requests as the extension: its token, no cookie. */
  const extension = async (
    path: string,
    init: { method?: string; body?: unknown; token?: string } = {}
  ) => {
    const res = await t.app.request(path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        authorization: `Bearer ${init.token ?? token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }

  beforeAll(async () => {
    const photo = await sharp({
      create: { width: 900, height: 700, channels: 3, background: "#d94" },
    })
      .jpeg()
      .toBuffer()
    const fetcher: Fetcher = async (url, options) => {
      fetched.push(`${url} from ${options?.referer ?? "-"}`)
      if (url.endsWith(".jpg")) {
        return { url, contentType: "image/jpeg", body: photo }
      }
      throw new Error("Mise's server isn't allowed in")
    }
    t = await createTestAppWithAdmin({ fetcher })
  })
  afterAll(() => t.close())

  test("connecting makes a token, shown once, that works in place of signing in", async () => {
    const res = await t.admin.post("/api/extension/tokens", {
      name: "Chrome on Windows",
    })
    expect(res.status).toBe(201)
    token = res.body.token
    expect(token).toMatch(/^mise_[\w-]{40,}$/)
    expect(res.body.info).toMatchObject({
      name: "Chrome on Windows",
      lastUsedAt: null,
    })

    const me = await extension("/api/auth/me")
    expect(me.status).toBe(200)
    expect(me.body.user.username).toBe("kyle")

    const listed = (await t.admin.get("/api/extension/tokens")).body
      .tokens as ExtensionToken[]
    expect(listed).toHaveLength(1)
    expect(listed[0]!.lastUsedAt).not.toBeNull()
    expect(JSON.stringify(listed)).not.toContain(token)
  })

  test("a token can't make more tokens, and a wrong one is refused", async () => {
    expect(
      (await extension("/api/extension/tokens", { body: { name: "More" } }))
        .status
    ).toBe(403)
    const wrong = await extension("/api/auth/me", { token: "mise_nope" })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toMatch(/Connect the extension again/)
  })

  test("imports a page as the browser saw it", async () => {
    const page = {
      url: "https://paywalled.example/pie?utm_source=x",
      title: "Paywalled Pie | Example",
      jsonld: [JSON.stringify(RECIPE)],
      images: ["https://cdn.example/share.jpg"],
      text: "Paywalled Pie\n\nA pie you can only see when signed in.",
    }
    const res = await extension("/api/import/page", { body: page })
    expect(res.status).toBe(201)
    const recipe = res.body.recipe as Recipe
    expect(recipe).toMatchObject({
      name: "Paywalled Pie",
      origin: "url",
      sourceUrl: "https://paywalled.example/pie",
    })
    expect(recipe.ingredients.map((i) => i.text)).toEqual([
      "2 cups flour",
      "1 cup butter",
    ])
    expect(recipe.imageUrl).toBeTruthy()
    expect(fetched).toContain(
      "https://cdn.example/pie.jpg from https://paywalled.example/pie"
    )

    const again = await extension("/api/import/page", { body: page })
    expect(again.status).toBe(200)
    expect(again.body.duplicate).toBe(true)
  })

  test("a page without recipe data needs AI to read it", async () => {
    const res = await extension("/api/import/page", {
      body: { url: "https://plain.example/notes", text: "Some notes" },
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/doesn't include recipe data/)
  })

  test("only you see and revoke your connected browsers", async () => {
    const invite = await t.admin.post("/api/household/invites", {})
    const sam = apiClient(t.app)
    await sam.post(`/api/join/${invite.body.invite.token}`, {
      username: "sam",
      displayName: "Sam",
      password: "another long password",
    })
    expect((await sam.get("/api/extension/tokens")).body.tokens).toEqual([])
    const [mine] = (await t.admin.get("/api/extension/tokens")).body
      .tokens as ExtensionToken[]
    expect((await sam.delete(`/api/extension/tokens/${mine!.id}`)).status).toBe(
      404
    )

    expect(
      (await t.admin.delete(`/api/extension/tokens/${mine!.id}`)).status
    ).toBe(204)
    expect((await extension("/api/auth/me")).status).toBe(401)
  })

  test("downloads the packaged extension when the server has it", async () => {
    const missing = await t.admin.raw("/api/extension/download")
    const original = config.extensionZip
    config.extensionZip = join(tmpdir(), "no-such-mise-extension.zip")
    try {
      expect((await t.admin.raw("/api/extension/download")).status).toBe(404)
      const dir = await mkdtemp(join(tmpdir(), "mise-ext-"))
      config.extensionZip = join(dir, "mise-extension.zip")
      await writeFile(config.extensionZip, "PK fake zip")
      const res = await t.admin.raw("/api/extension/download")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/zip")
      expect(await res.text()).toBe("PK fake zip")
    } finally {
      config.extensionZip = original
    }
    expect([200, 404]).toContain(missing.status)
  })
})
