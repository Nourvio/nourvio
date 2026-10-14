import {
  describeTastes,
  type DiscoveredRecipe,
  type Discovery,
  type StarterRecipe,
} from "@mise/shared"
import { and, desc, eq, notInArray } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { ChatToolCall, ChatToolSpec } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { discoveries } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { extractRecipeFromHtml } from "../import/jsonld.ts"
import { inLibrary, isVideoUrl, normalizeUrl } from "../import/links.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { getHousehold } from "./households.ts"

type Found = StarterRecipe & { why: string }
type Row = typeof discoveries.$inferSelect

/** Searches kept per household; older ones are cleared. */
const KEEP = 12
/** Recipes shown for a theme. */
const SHOW = 8
/** From one site, unless there aren't enough others. */
const PER_SITE = 2
/** Model calls for one search, counting the provider pausing a long one. */
const MAX_ROUNDS = 6
/** A search running longer than this was cut short (by a restart, say). */
const STALE_MS = 5 * 60_000

const SYSTEM = `You find recipes on the web for a home cook's recipe app. Search for recipes that fit the theme you're given, then call offer_recipes once with 10 to 12 of the best.
- Each must be one recipe's own page on a site that's free to read: not a roundup, a category page, a video or a search result.
- Well-tested sources first, such as RecipeTin Eats, BBC Good Food, Love and Lemons, Pinch of Yum, King Arthur Baking, Sally's Baking Addiction, Bon Appétit, Budget Bytes, Cookie and Kate, Minimalist Baker, Smitten Kitchen and newspapers' free recipe pages.
- Mise can't open some sites, so leave out Serious Eats, Allrecipes, Simply Recipes and Food Network.
- Make it a spread: different main ingredients and methods, never the same dish twice, and from at least five different sites (no more than two from one site).
- Follow the household's rules strictly: nothing with a food they avoid, and only recipes that fit their diets.
- "why" is one short sentence for the card on what makes it a good pick, like "Bright and fast, on the table in 25 minutes".
- Don't ask questions; pick for them.`

const OFFER_TOOL: ChatToolSpec = {
  name: "offer_recipes",
  description:
    "Offer the recipes you found, best first. Call it once, with every pick.",
  inputSchema: {
    type: "object",
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string", description: "The recipe page's link" },
            title: { type: "string", description: "The recipe's name" },
            site: {
              type: "string",
              description: 'Where it\'s from, like "BBC Good Food"',
            },
            why: {
              type: "string",
              description: "One short sentence on why it's a good pick",
            },
          },
          required: ["url", "title", "site", "why"],
        },
      },
    },
    required: ["recipes"],
  },
}

const offered = z.object({
  recipes: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        site: z.string(),
        why: z.string(),
      })
    )
    .max(20),
})
type Offered = z.output<typeof offered>["recipes"][number]

function decode(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body)
  } catch {
    return body.toString("utf8")
  }
}

/**
 * Opens a recipe the assistant offered and reads it as Mise would on import.
 * Null when the page won't open or isn't a recipe Mise can read.
 */
async function check(fetcher: Fetcher, pick: Offered): Promise<Found | null> {
  let url: string
  try {
    url = normalizeUrl(pick.url)
    if (isVideoUrl(url)) return null
  } catch {
    return null
  }
  try {
    const page = await fetcher(url)
    if (page.contentType && !/html|xml/i.test(page.contentType)) return null
    const finalUrl = normalizeUrl(page.url)
    const recipe = extractRecipeFromHtml(
      decode(page.body, page.contentType),
      finalUrl
    )
    if (!recipe) return null
    return {
      url: finalUrl,
      title: recipe.input.name,
      site: pick.site.trim().slice(0, 80) || new URL(finalUrl).hostname,
      minutes: recipe.input.totalMinutes ?? null,
      image: recipe.imageUrls[0] ?? null,
      why: pick.why.trim().slice(0, 200),
    }
  } catch {
    return null
  }
}

/** Checks picks a few at a time, keeping the order they were offered in. */
async function checkAll(fetcher: Fetcher, picks: Offered[]) {
  const results: (Found | null)[] = new Array(picks.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < picks.length) {
      const index = next++
      results[index] = await check(fetcher, picks[index]!)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return results
}

/**
 * Up to SHOW recipes, best first, with no more than PER_SITE from one site
 * unless there aren't enough from others.
 */
export function spread<T extends { url: string }>(recipes: T[]) {
  const counts = new Map<string, number>()
  const picked: T[] = []
  const extra: T[] = []
  for (const recipe of recipes) {
    const site = new URL(recipe.url).hostname.replace(/^www\./, "")
    const count = counts.get(site) ?? 0
    if (count < PER_SITE) {
      counts.set(site, count + 1)
      picked.push(recipe)
    } else {
      extra.push(recipe)
    }
  }
  const chosen = new Set([...picked, ...extra].slice(0, SHOW))
  // Keep the order they were offered in.
  return recipes.filter((recipe) => chosen.has(recipe))
}

function isStale(row: Row) {
  return (
    row.status === "searching" &&
    Date.now() - row.createdAt.getTime() > STALE_MS
  )
}

async function toDiscoveries(
  db: Db,
  householdId: string,
  rows: Row[]
): Promise<Discovery[]> {
  const library = await inLibrary(
    db,
    householdId,
    rows.flatMap((row) => row.recipes.map((recipe) => recipe.url))
  )
  return rows.map((row) => {
    const stale = isStale(row)
    return {
      id: row.id,
      theme: row.theme,
      status: stale ? "failed" : row.status,
      error: stale ? "That search was cut short. Try it again." : row.error,
      recipes: row.recipes.map((recipe, index): DiscoveredRecipe => ({
        url: recipe.url,
        title: recipe.title,
        site: recipe.site,
        minutes: recipe.minutes,
        imageUrl: recipe.image
          ? `/api/discover/${row.id}/${index}/image`
          : null,
        inLibrary: library.get(recipe.url) ?? null,
        why: recipe.why,
      })),
      createdAt: row.createdAt.toISOString(),
    }
  })
}

/** The household's recent searches, newest first. */
export async function listDiscoveries(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.householdId, householdId))
    .orderBy(desc(discoveries.createdAt))
    .limit(KEEP)
  return toDiscoveries(db, householdId, rows)
}

async function getRow(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(discoveries)
        .where(
          and(eq(discoveries.id, id), eq(discoveries.householdId, householdId))
        )
    : []
  if (!row) throw new HttpError(404, "That search isn't here any more")
  return row
}

export async function getDiscovery(db: Db, householdId: string, id: string) {
  const [discovery] = await toDiscoveries(db, householdId, [
    await getRow(db, householdId, id),
  ])
  return discovery!
}

/** A found recipe's photo link and page, for showing it through Mise. */
export async function discoveredPhoto(
  db: Db,
  householdId: string,
  id: string,
  index: number
) {
  const recipe = (await getRow(db, householdId, id)).recipes[index]
  if (!recipe?.image) throw new HttpError(404, "No photo")
  return { image: recipe.image, page: recipe.url }
}

/**
 * Asks the assistant (a small model that can search the web) for recipes on
 * a theme that suit the household, and keeps the ones whose pages open and
 * read as recipes. A second round asks for more when too few do.
 */
async function search(
  db: Db,
  ai: AiService,
  fetcher: Fetcher,
  actor: AiActor & { householdId: string },
  theme: string
): Promise<Found[]> {
  const { provider, model } = await ai.resolve("discover")
  const adapter = provider.chat
  if (!adapter) throw new HttpError(400, "That AI provider can't search")
  const { tastes } = await getHousehold(db, actor.householdId)
  const rules = describeTastes(tastes)
  const history: unknown[] = [
    adapter.userMessage(
      [`Theme: ${theme}`, rules ? `The household's rules:\n${rules}` : null]
        .filter(Boolean)
        .join("\n\n")
    ),
  ]
  const usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 }
  const found: Found[] = []
  const seen = new Set<string>()
  let asked = false
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const turn = await adapter.turn({
        model,
        system: SYSTEM,
        history,
        tools: [OFFER_TOOL],
        webSearch: true,
        onText: () => {},
      })
      usage.inputTokens += turn.usage.inputTokens
      usage.outputTokens += turn.usage.outputTokens
      usage.webSearches += turn.usage.webSearches ?? 0
      history.push(...turn.native)
      const call = turn.toolCalls.find(
        (item: ChatToolCall) => item.name === OFFER_TOOL.name
      )
      if (!call) {
        if (turn.stop === "pause") continue
        if (asked) break
        // It answered in words instead; ask for the tool once.
        asked = true
        history.push(
          adapter.userMessage("Call offer_recipes with your picks now.")
        )
        continue
      }
      const parsed = offered.safeParse(call.input)
      const picks = (parsed.success ? parsed.data.recipes : []).filter(
        (pick) => {
          const key = pick.url.trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }
      )
      const checked = await checkAll(fetcher, picks)
      for (const recipe of checked) {
        if (recipe && !found.some((item) => item.url === recipe.url)) {
          found.push(recipe)
        }
      }
      const missed = picks.filter((_, index) => !checked[index])
      // Enough, or already asked for more.
      if (found.length >= 4 || round > 0 || !missed.length) break
      history.push(
        ...adapter.toolResults([
          {
            id: call.id,
            output: `Mise couldn't open these or read them as recipes, so they were left out: ${missed
              .map((pick) => pick.url)
              .join(
                ", "
              )}. Call offer_recipes again with ${SHOW - found.length} more from other sites.`,
            isError: false,
          },
        ])
      )
    }
  } finally {
    await ai.recordUsage(actor, provider.id, model, "discover", usage)
  }
  return spread(found)
}

/**
 * Starts a search on a theme and returns straight away; the search carries
 * on in the background (a minute or so) and the row says how it went.
 */
export async function startDiscovery(
  db: Db,
  ai: AiService,
  fetcher: Fetcher,
  actor: AiActor & { householdId: string },
  theme: string
) {
  const { householdId } = actor
  const [running] = await db
    .select()
    .from(discoveries)
    .where(
      and(
        eq(discoveries.householdId, householdId),
        eq(discoveries.status, "searching")
      )
    )
  if (running && !isStale(running)) {
    throw new HttpError(409, "Mise is still finding the last ones")
  }
  // Fails now, rather than in the background, when there's no AI.
  await ai.resolve("discover")

  const [row] = await db
    .insert(discoveries)
    .values({ householdId, userId: actor.userId, theme, status: "searching" })
    .returning()

  // Keep the latest few.
  const keep = db
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(eq(discoveries.householdId, householdId))
    .orderBy(desc(discoveries.createdAt))
    .limit(KEEP)
  await db
    .delete(discoveries)
    .where(
      and(
        eq(discoveries.householdId, householdId),
        notInArray(discoveries.id, keep)
      )
    )

  void search(db, ai, fetcher, actor, theme)
    .then((recipes) =>
      db
        .update(discoveries)
        .set(
          recipes.length
            ? { status: "done", recipes }
            : {
                status: "failed",
                error:
                  "Couldn't find recipes Mise can open for that just now. Try saying it another way.",
              }
        )
        .where(eq(discoveries.id, row!.id))
    )
    .catch((error: unknown) =>
      db
        .update(discoveries)
        .set({
          status: "failed",
          error:
            error instanceof HttpError
              ? error.message
              : "The search didn't work just now. Try again in a minute.",
        })
        .where(eq(discoveries.id, row!.id))
        .catch(() => {})
    )

  return (await toDiscoveries(db, householdId, [row!]))[0]!
}
