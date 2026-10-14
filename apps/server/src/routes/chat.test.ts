import type { ChatStreamEvent } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type {
  AiProviderFactory,
  ChatToolCall,
  ChatToolSpec,
} from "../ai/types.ts"
import { HttpError } from "../http.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** One scripted model turn: some text, and maybe tool calls, web searches or a pause. */
type Step =
  | {
      text?: string
      tools?: ChatToolCall[]
      searches?: { id: string; query: string }[]
      pause?: boolean
    }
  | Error

type Seen = {
  history: unknown[]
  system: string
  tools: ChatToolSpec[]
  webSearch: boolean
}

/**
 * A pretend chat model. Each call to `turn` plays the next scripted step;
 * history is kept as simple objects, the way a real provider keeps its own.
 */
function fakeChat() {
  const state = { script: [] as Step[], seen: [] as Seen[] }
  const factory: AiProviderFactory = (id) => ({
    id,
    async extract() {
      throw new Error("not used")
    },
    async listModels() {
      return []
    },
    chat: {
      async turn({ history, system, tools, webSearch, onText }) {
        state.seen.push({
          history: structuredClone(history),
          system,
          tools,
          webSearch: Boolean(webSearch),
        })
        const step = state.script.shift() ?? { text: "Done." }
        if (step instanceof Error) throw step
        for (const word of (step.text ?? "").split(/(?<= )/)) onText(word)
        return {
          native: [
            {
              role: "assistant",
              text: step.text ?? "",
              tools: step.tools ?? [],
            },
          ],
          toolCalls: step.tools ?? [],
          stop: step.tools?.length ? "tool_use" : step.pause ? "pause" : "end",
          searches: step.searches ?? [],
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            webSearches: step.searches?.length ?? 0,
          },
        }
      },
      userMessage: (text) => ({ role: "user", text }),
      toolResults: (results) => [{ role: "tool", results }],
      assistantText: (text) => ({ role: "assistant", text }),
    },
  })
  return { state, factory }
}

describe("chat", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const chat = fakeChat()
  let pancakes: { id: string; slug: string }
  let conversationId: string

  beforeAll(async () => {
    t = await createTestAppWithAdmin({
      aiFactory: chat.factory,
      // A pretend internet where one site blocks anything that isn't a browser.
      fetcher: async (url) => {
        if (url.includes("blocked.example")) {
          throw new HttpError(502, "That site blocked the request")
        }
        return {
          url,
          contentType: "text/html",
          body: Buffer.from("<html></html>"),
        }
      },
    })
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    pancakes = (
      await t.admin.post("/api/recipes", {
        name: "Buttermilk Pancakes",
        servings: 4,
        ingredients: [
          "# Dry",
          "2 cups flour",
          "# Wet",
          "2 cups buttermilk",
          "2 eggs",
        ],
        steps: ["Mix.", "Cook."],
      })
    ).body.recipe
  })
  afterAll(() => t.close())

  /** Sends a message and reads the whole event stream. */
  async function send(
    body: Record<string, unknown>,
    client = t.admin
  ): Promise<{ status: number; events: ChatStreamEvent[]; body?: unknown }> {
    const res = await client.stream("/api/chat", body)
    if (!res.headers.get("content-type")?.includes("text/event-stream")) {
      return { status: res.status, events: [], body: await res.json() }
    }
    const text = await res.text()
    const events = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5)) as ChatStreamEvent)
    return { status: res.status, events }
  }

  test("answers, using tools and proposing an edit, and streams it all", async () => {
    chat.state.script = [
      {
        text: "Let me look. ",
        tools: [
          { id: "c1", name: "get_recipe", input: { recipe: pancakes.slug } },
        ],
      },
      {
        text: "Milk with lemon juice works. ",
        tools: [
          {
            id: "c2",
            name: "propose_recipe_edit",
            input: {
              recipe: pancakes.id,
              summary: "Swaps buttermilk for milk and lemon juice.",
              variantName: "Pancakes (no buttermilk)",
              name: null,
              description: null,
              servings: null,
              ingredients: [
                "# Dry",
                "2 cups flour",
                "# Wet",
                "2 cups milk plus 2 tbsp lemon juice",
                "2 eggs",
              ],
              steps: null,
              tags: null,
              notes: null,
            },
          },
        ],
      },
      { text: "The card above has the swap." },
    ]
    const { status, events } = await send({
      message: "No buttermilk, what can I use?",
      context: { recipeId: pancakes.id, scale: 2 },
    })
    expect(status).toBe(200)

    const types = events.map((e) => e.type)
    expect(types[0]).toBe("conversation")
    expect(types.at(-1)).toBe("done")
    expect(types).toContain("proposal")
    const text = events
      .flatMap((e) => (e.type === "text" ? [e.delta] : []))
      .join("")
    expect(text).toBe(
      "Let me look. Milk with lemon juice works. The card above has the swap."
    )
    const tools = events.flatMap((e) =>
      e.type === "tool" && e.status !== "running" ? [e.label] : []
    )
    expect(tools).toEqual([
      "Read Buttermilk Pancakes",
      "Suggested changes to Buttermilk Pancakes",
    ])

    const proposal = events.find((e) => e.type === "proposal")!
    if (proposal.type !== "proposal") throw new Error()
    expect(proposal.proposal).toMatchObject({
      kind: "recipe_edit",
      status: "pending",
      variantName: "Pancakes (no buttermilk)",
      recipe: { id: pancakes.id },
    })
    expect(Object.keys(proposal.proposal.after)).toEqual(["ingredients"])

    // The model saw the recipe on screen, at its scale, and every tool.
    const first = chat.state.seen.at(-3)!
    const userMessage = JSON.stringify(first.history.at(-1))
    expect(userMessage).toContain("<context>")
    expect(userMessage).toContain("shown at 2× the amounts, so 8 servings")
    expect(userMessage).toContain("2 cups buttermilk")
    expect(first.tools.map((tool) => tool.name)).toContain("propose_new_recipe")
    expect(first.system).toContain("The Kitchen")

    const conversation = events[0]!
    if (conversation.type !== "conversation") throw new Error()
    conversationId = conversation.conversation.id
    expect(conversation.conversation.title).toBe(
      "No buttermilk, what can I use?"
    )
  })

  test("searches the web and offers a found recipe to import", async () => {
    chat.state.script = [
      // A long search turn the provider paused, then carried on.
      { searches: [{ id: "s1", query: "best birria recipe" }], pause: true },
      {
        text: "This one's a keeper. ",
        searches: [{ id: "s2", query: "birria serious eats" }],
        tools: [
          {
            id: "c9",
            name: "propose_import_recipe",
            input: {
              url: "https://www.seriouseats.com/birria-recipe?utm_source=x",
              title: "Birria de Res",
              site: "Serious Eats",
              why: "Tested to death, with a deep, rich consommé.",
            },
          },
        ],
      },
      { text: "Tap Import to add it." },
    ]
    const { events } = await send({ message: "Find me a good birria recipe" })
    const tools = events.flatMap((e) =>
      e.type === "tool" && e.status !== "running" ? [e.label] : []
    )
    expect(tools).toEqual([
      "Searched the web for “best birria recipe”",
      "Searched the web for “birria serious eats”",
      "Found Birria de Res",
    ])
    expect(chat.state.seen.at(-1)!.webSearch).toBe(true)
    const card = events.find((e) => e.type === "proposal")
    if (card?.type !== "proposal") throw new Error("No card")
    expect(card.proposal).toMatchObject({
      kind: "import_link",
      summary: "Tested to death, with a deep, rich consommé.",
      // Tracking bits are dropped from the link.
      link: {
        url: "https://www.seriouseats.com/birria-recipe",
        title: "Birria de Res",
        site: "Serious Eats",
      },
    })
  })

  test("doesn't offer a recipe that's already in the library", async () => {
    await t.admin.post("/api/recipes", {
      name: "Grandma's Chili",
      sourceUrl: "https://food.example/chili",
      ingredients: ["1 lb beef"],
    })
    chat.state.script = [
      {
        tools: [
          {
            id: "c10",
            name: "propose_import_recipe",
            input: {
              url: "https://food.example/chili",
              title: "Chili",
              site: "Food Example",
              why: "Classic.",
            },
          },
        ],
      },
      { text: "You already have it." },
    ]
    const { events } = await send({ message: "Find a chili recipe" })
    expect(events.some((e) => e.type === "proposal")).toBe(false)
    const tools = events.flatMap((e) =>
      e.type === "tool" && e.status !== "running" ? [e.label] : []
    )
    expect(tools).toEqual(["Already have Grandma's Chili"])
  })

  test("doesn't offer a page Mise can't open", async () => {
    chat.state.script = [
      {
        tools: [
          {
            id: "c11",
            name: "propose_import_recipe",
            input: {
              url: "https://blocked.example/tacos",
              title: "Tacos",
              site: "Blocked Eats",
              why: "Good.",
            },
          },
        ],
      },
      { text: "That site won't open; here's another." },
    ]
    const { events } = await send({ message: "Find tacos" })
    expect(events.some((e) => e.type === "proposal")).toBe(false)
    const tools = events.flatMap((e) =>
      e.type === "tool" && e.status !== "running" ? [e.label] : []
    )
    expect(tools).toEqual(["Couldn't open Blocked Eats"])
    expect(JSON.stringify(chat.state.seen.at(-1)!.history)).toContain(
      "Offer a recipe from a different site instead"
    )
  })

  test("keeps the conversation, with its cards", async () => {
    const res = await t.admin.get(`/api/chat/conversations/${conversationId}`)
    const { messages, proposals } = res.body.conversation
    expect(messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ])
    expect(messages[0].contextLabel).toBe("Buttermilk Pancakes")
    expect(messages[0].parts).toEqual([
      { type: "text", text: "No buttermilk, what can I use?" },
    ])
    expect(messages[1].parts.map((p: { type: string }) => p.type)).toEqual([
      "text",
      "tool",
      "text",
      "tool",
      "proposal",
      "text",
    ])
    expect(Object.values(proposals)).toHaveLength(1)

    const list = (await t.admin.get("/api/chat/conversations")).body
      .conversations
    expect(list.map((c: { id: string }) => c.id)).toContain(conversationId)
  })

  test("continues with the whole history", async () => {
    chat.state.script = [{ text: "You're welcome!" }]
    const { events } = await send({ conversationId, message: "Thanks" })
    expect(events.at(-1)?.type).toBe("done")
    const history = chat.state.seen.at(-1)!.history
    // user, 3 assistant turns and 2 tool results from before, then the new message.
    expect(history).toHaveLength(7)
    expect(history.at(-1)).toEqual({ role: "user", text: "Thanks" })
  })

  test("saves the edit as a new recipe, leaving the original", async () => {
    const res = await t.admin.get(`/api/chat/conversations/${conversationId}`)
    const proposal = Object.values(res.body.conversation.proposals)[0] as {
      id: string
    }
    const applied = await t.admin.post(`/api/proposals/${proposal.id}/apply`, {
      sections: ["ingredients"],
      asNew: true,
    })
    expect(applied.status).toBe(200)
    expect(applied.body.recipe).toMatchObject({
      name: "Pancakes (no buttermilk)",
      origin: "chat",
    })
    expect(applied.body.proposal).toMatchObject({
      status: "applied",
      result: { name: "Pancakes (no buttermilk)" },
    })
    const original = (await t.admin.get(`/api/recipes/${pancakes.id}`)).body
      .recipe
    expect(original.ingredients[1].text).toBe("2 cups buttermilk")
  })

  test("drafts a new recipe for saving", async () => {
    chat.state.script = [
      {
        tools: [
          {
            id: "c3",
            name: "propose_new_recipe",
            input: {
              summary: "A quick shakshuka for two.",
              name: "Shakshuka",
              description: null,
              servings: 2,
              prepMinutes: null,
              cookMinutes: 20,
              totalMinutes: null,
              ingredients: ["1 can tomatoes", "4 eggs"],
              steps: ["Simmer the tomatoes.", "Poach the eggs in them."],
              tags: ["Breakfast"],
              notes: null,
            },
          },
        ],
      },
      { text: "Saved? Not yet: tap the card." },
    ]
    const { events } = await send({ message: "Give me a shakshuka recipe" })
    const proposal = events.find((e) => e.type === "proposal")
    if (proposal?.type !== "proposal") throw new Error("no proposal")
    expect(proposal.proposal).toMatchObject({
      kind: "new_recipe",
      recipe: null,
    })
    expect(proposal.proposal.draft).toMatchObject({
      name: "Shakshuka",
      tags: ["breakfast"],
    })

    const saved = await t.admin.post(
      `/api/proposals/${proposal.proposal.id}/apply`,
      {}
    )
    expect(saved.body.recipe).toMatchObject({
      name: "Shakshuka",
      servings: 2,
      origin: "chat",
    })
  })

  test("plans meals and adds to the list, for the week on screen", async () => {
    const week = "2026-10-12"
    await t.admin.post("/api/plan/entries", {
      date: week,
      meal: "dinner",
      note: "Tacos out",
    })
    chat.state.script = [
      {
        tools: [
          {
            id: "p1",
            name: "get_meal_plan",
            input: { from: week, to: "2026-10-18" },
          },
          { id: "p2", name: "get_shopping_list", input: {} },
        ],
      },
      {
        tools: [
          {
            id: "p3",
            name: "propose_meals",
            input: {
              summary: "Pancakes Tuesday, leftovers Wednesday.",
              meals: [
                {
                  date: "2026-10-13",
                  meal: "breakfast",
                  recipe: pancakes.slug,
                  with: null,
                  note: null,
                  servings: 2,
                },
                {
                  date: "2026-10-14",
                  meal: "dinner",
                  recipe: null,
                  with: null,
                  note: "Leftovers",
                  servings: null,
                },
                {
                  date: "2026-10-15",
                  meal: "dinner",
                  recipe: "not-a-recipe",
                  with: null,
                  note: null,
                  servings: null,
                },
              ],
            },
          },
          {
            id: "p4",
            name: "propose_list_items",
            input: {
              summary: "Drinks and paper towels.",
              items: ["Diet Pepsi", "paper towels", " "],
            },
          },
        ],
      },
      { text: "Two cards above." },
    ]
    const { events } = await send({
      message: "Plan the rest of my week",
      context: { weekStart: week },
    })

    // The model saw the week on screen, then read the plan and the list.
    const first = chat.state.seen.at(-3)!
    const userMessage = JSON.stringify(first.history.at(-1))
    expect(userMessage).toContain("meal plan for 2026-10-12 to 2026-10-18")
    expect(userMessage).toContain("2026-10-12 dinner: Note: Tacos out")
    const reads = JSON.stringify(chat.state.seen.at(-2)!.history.slice(-1))
    expect(reads).toContain("Tacos out")
    expect(reads).toContain("The list is empty.")
    const left = JSON.stringify(chat.state.seen.at(-1)!.history.slice(-1))
    expect(left).toContain("Not found, so left out: not-a-recipe")

    const labels = events.flatMap((e) =>
      e.type === "tool" && e.status !== "running" ? [e.label] : []
    )
    expect(labels).toEqual([
      "Checked the plan",
      "Checked the list",
      "Suggested 2 meals",
      "Suggested 2 items for the list",
    ])
    const started = events[0]
    if (started?.type !== "conversation") throw new Error("no conversation")
    const saved = await t.admin.get(
      `/api/chat/conversations/${started.conversation.id}`
    )
    expect(saved.body.conversation.messages[0].contextLabel).toBe(
      "the plan for Oct 12 – 18"
    )

    const [meals, items] = events.flatMap((e) =>
      e.type === "proposal" ? [e.proposal] : []
    )
    expect(meals).toMatchObject({
      kind: "plan_meals",
      recipe: null,
      meals: [
        { meal: "breakfast", recipe: { slug: pancakes.slug }, servings: 2 },
        { meal: "dinner", recipe: null, note: "Leftovers" },
      ],
    })
    expect(items).toMatchObject({
      kind: "list_items",
      items: ["Diet Pepsi", "paper towels"],
    })

    const applied = await t.admin.post(`/api/proposals/${meals!.id}/apply`, {})
    expect(applied.status).toBe(200)
    expect(applied.body.recipe).toBeNull()
    expect(applied.body.proposal.status).toBe("applied")
    const plan = await t.admin.get(`/api/plan?from=${week}&to=2026-10-18`)
    expect(
      plan.body.entries.map(
        (e: { date: string; recipe: { name: string } | null; note: string }) =>
          `${e.date} ${e.recipe?.name ?? e.note}`
      )
    ).toEqual([
      "2026-10-12 Tacos out",
      "2026-10-13 Buttermilk Pancakes",
      "2026-10-14 Leftovers",
    ])

    await t.admin.post(`/api/proposals/${items!.id}/apply`, {})
    const list = await t.admin.get("/api/list")
    expect(
      list.body.items.map((item: { name: string }) => item.name).sort()
    ).toEqual(["Diet Pepsi", "paper towels"])
  })

  test("tells the model when a tool goes wrong, and carries on", async () => {
    chat.state.script = [
      { tools: [{ id: "c4", name: "get_recipe", input: { recipe: "nope" } }] },
      { tools: [{ id: "c5", name: "get_recipe", input: { wrong: true } }] },
      { tools: [{ id: "c6", name: "delete_everything", input: {} }] },
      { text: "Sorry, I couldn't find it." },
    ]
    const { events } = await send({ message: "Open my lasagna" })
    const errors = events.filter(
      (e) => e.type === "tool" && e.status === "error"
    )
    expect(errors).toHaveLength(3)
    expect(events.at(-1)?.type).toBe("done")
    const results = JSON.stringify(chat.state.seen.at(-1)!.history.slice(-1))
    expect(results).toContain("no tool called delete_everything")
  })

  test("saves nothing when the AI fails, so it can be sent again", async () => {
    const before = (await t.admin.get("/api/chat/conversations")).body
      .conversations.length
    chat.state.script = [new HttpError(502, "Claude didn't accept the API key")]
    const { events } = await send({ message: "Hello?" })
    expect(events.at(-1)).toEqual({
      type: "error",
      message: "Claude didn't accept the API key",
    })
    const after = (await t.admin.get("/api/chat/conversations")).body
      .conversations.length
    expect(after).toBe(before)
  })

  test("keeps conversations private", async () => {
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "another long password",
    })
    const sam = apiClient(t.app)
    await sam.post("/api/auth/login", {
      username: "sam",
      password: "another long password",
    })
    expect(
      (await sam.get(`/api/chat/conversations/${conversationId}`)).status
    ).toBe(404)
    expect(
      (await sam.get("/api/chat/conversations")).body.conversations
    ).toEqual([])
    const res = await send({ conversationId, message: "Hi" }, sam)
    expect(res.status).toBe(404)
  })

  test("needs AI to be set up", async () => {
    await t.admin.put("/api/ai/settings", { keys: { anthropic: null } })
    const res = await send({ message: "Hello" })
    expect(res.status).toBe(400)
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
  })

  test("deletes a conversation", async () => {
    expect(
      (await t.admin.delete(`/api/chat/conversations/${conversationId}`)).status
    ).toBe(204)
    expect(
      (await t.admin.get(`/api/chat/conversations/${conversationId}`)).status
    ).toBe(404)
  })
})
