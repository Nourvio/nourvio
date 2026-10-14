import type { Nutrition, RecipeInput } from "@mise/shared"
import { load } from "cheerio"

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD is untyped by nature */

export type ExtractedRecipe = {
  input: RecipeInput
  /** Photos to try, best first: the recipe's own, then the page's share image. */
  imageUrls: string[]
}

/** Decodes HTML entities, drops tags and collapses whitespace. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return ""
  const text = String(value)
  const decoded = /[<&]/.test(text)
    ? load(`<div>${text}</div>`)("div").text()
    : text
  return decoded.replace(/\s+/g, " ").trim()
}

function asArray(value: unknown): any[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function isRecipe(node: any) {
  const type = node?.["@type"]
  return asArray(type).some(
    (t) => typeof t === "string" && t.toLowerCase().endsWith("recipe")
  )
}

/** Finds the Recipe object anywhere in parsed JSON-LD (arrays, @graph, mainEntity). */
export function findRecipeNode(data: any, depth = 0): any {
  if (!data || typeof data !== "object" || depth > 6) return null
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (isRecipe(data)) return data
  for (const key of [
    "@graph",
    "mainEntity",
    "mainEntityOfPage",
    "itemListElement",
  ]) {
    const found = findRecipeNode(data[key], depth + 1)
    if (found) return found
  }
  return null
}

/** "PT1H30M" → 90. Also copes with "P0DT0H20M" and plain numbers. */
export function parseDuration(value: unknown): number | null {
  if (typeof value === "number") return value > 0 ? Math.round(value) : null
  if (typeof value !== "string") return null
  const match = value
    .trim()
    .match(
      /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    )
  if (!match) return null
  const [, days, hours, minutes, seconds] = match.map((part) =>
    Number(part ?? 0)
  )
  const total = days! * 1440 + hours! * 60 + minutes! + seconds! / 60
  return total > 0 ? Math.round(total) : null
}

export function parseYield(value: unknown) {
  const texts = asArray(value).map(cleanText).filter(Boolean)
  let servings: number | null = null
  let yieldText: string | null = null
  for (const text of texts) {
    const number = text.match(/\d+(?:\.\d+)?/)
    if (number && servings === null) servings = Number(number[0])
    const words = text
      .replace(/[\d.\s-]+/g, " ")
      .trim()
      .toLowerCase()
    if (
      words &&
      !/^(servings?|serves|people|persons?|portions?)$/.test(words)
    ) {
      yieldText ??= text.slice(0, 100)
    }
  }
  return {
    servings: servings && servings > 0 && servings <= 1000 ? servings : null,
    yieldText,
  }
}

/**
 * Every object with an "@id" in the page's JSON-LD, so references like
 * `"image": { "@id": "…#primaryimage" }` (common on WordPress sites) can be
 * followed to the ImageObject they point at.
 */
function indexIds(data: any, index = new Map<string, any>(), depth = 0) {
  if (!data || typeof data !== "object" || depth > 8) return index
  if (Array.isArray(data)) {
    for (const item of data) indexIds(item, index, depth + 1)
    return index
  }
  if (typeof data["@id"] === "string" && Object.keys(data).length > 1) {
    index.set(data["@id"], data)
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") indexIds(value, index, depth + 1)
  }
  return index
}

/**
 * Pixels in a photo, from its ImageObject or the size in its link
 * ("-1200x800.jpg", "/1500x0/", "?resize=500,375", "?w=1200"); 0 when unknown.
 */
function pixels(item: any, url: string) {
  const width = Number(item?.width?.value ?? item?.width)
  const height = Number(item?.height?.value ?? item?.height)
  if (width > 0 && height > 0) return width * height
  const link = url.replace(/%2C/gi, ",")
  const pair =
    link.match(/[-_/](\d{2,4})x(\d{1,4})(?:\.\w+(?:[?#]|$)|\/)/) ??
    link.match(/[?&](?:resize|fit|size)=(\d{2,4}),(\d{2,4})/)
  const w =
    Number(pair?.[1]) || Number(link.match(/[?&](?:w|width)=(\d{2,4})\b/)?.[1])
  const h =
    Number(pair?.[2]) || Number(link.match(/[?&](?:h|height)=(\d{2,4})\b/)?.[1])
  return w ? w * (h || w * 0.75) : 0
}

/** Big enough for the recipe page without looking soft. */
const BIG_PIXELS = 800 * 500

type Candidate = { url: string; size: number }

const RESIZE_PARAMS = ["resize", "fit", "size", "w", "h", "width", "height"]

/** A small copy's link without its resize settings, which image servers usually answer with the original. */
function original(url: string) {
  try {
    const link = new URL(url)
    const params = RESIZE_PARAMS.filter((key) => link.searchParams.has(key))
    if (!params.length) return null
    for (const key of params) link.searchParams.delete(key)
    return link.toString()
  } catch {
    return null
  }
}

/**
 * Best first: photos known to be big (biggest first), then ones of unknown
 * size in the page's order (often the originals), then known small ones.
 * A small copy's original is tried before the copy.
 */
function rankPhotos(found: Candidate[]) {
  const big = found
    .filter((f) => f.size >= BIG_PIXELS)
    .sort((a, b) => b.size - a.size)
  const small = found
    .filter((f) => f.size > 0 && f.size < BIG_PIXELS)
    .sort((a, b) => b.size - a.size)
  const unknown = [
    ...found.filter((f) => f.size === 0),
    ...small.flatMap((f) => {
      const url = original(f.url)
      return url ? [{ url, size: 0 }] : []
    }),
  ]
  return [...new Set([...big, ...unknown, ...small].map((f) => f.url))]
}

/** The recipe's photos as full links, with what's known of their size. */
function imageCandidates(
  value: unknown,
  ids: Map<string, any>,
  base: string
): Candidate[] {
  const found: Candidate[] = []
  for (const listed of asArray(value)) {
    const item =
      listed &&
      typeof listed === "object" &&
      typeof listed["@id"] === "string" &&
      !listed.url &&
      !listed.contentUrl
        ? (ids.get(listed["@id"]) ?? listed)
        : listed
    const raw =
      typeof item === "string" ? item : (item?.url ?? item?.contentUrl)
    for (const link of asArray(raw)) {
      if (typeof link !== "string" || !link.trim()) continue
      try {
        const url = new URL(link.trim(), base).toString()
        found.push({ url, size: pixels(item, url) })
      } catch {
        continue
      }
    }
  }
  return found
}

/** The page's share image (what a link preview shows), as a fallback photo. */
export function shareImages(
  html: string | ReturnType<typeof load>,
  base: string
) {
  const $ = typeof html === "string" ? load(html) : html
  const links = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ]
  const urls: string[] = []
  for (const link of links) {
    if (!link?.trim()) continue
    try {
      urls.push(new URL(link.trim(), base).toString())
    } catch {
      // Not a usable link.
    }
  }
  return [...new Set(urls)]
}

/** Steps as editor lines, with "# Section" lines for HowToSections. */
function instructionLines(value: unknown): string[] {
  const lines: string[] = []
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      const text = /<li/i.test(item)
        ? load(item)("li")
            .toArray()
            .map((li) => load(li).text())
        : item.split(/\n+/)
      lines.push(...text.map(cleanText).filter(Boolean))
    } else if (item && typeof item === "object") {
      const type = asArray(item["@type"]).join(" ")
      if (/HowToSection/i.test(type) || (item.itemListElement && !item.text)) {
        const name = cleanText(item.name)
        if (name) lines.push(`# ${name}`)
        lines.push(...instructionLines(item.itemListElement))
      } else {
        const text = cleanText(item.text ?? item.name ?? item.description)
        if (text) lines.push(text)
      }
    }
  }
  return lines
}

/** Keywords sites add for SEO that make useless tags. */
const JUNK_TAGS = new Set([
  "web",
  "recipe",
  "recipes",
  "food",
  "homepage",
  "easy recipe",
])

function tagsFrom(node: any): string[] {
  const raw = [
    ...asArray(node.recipeCategory),
    ...asArray(node.recipeCuisine),
    ...asArray(node.keywords).flatMap((k) =>
      typeof k === "string" ? k.split(",") : []
    ),
  ]
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of raw) {
    const tag = cleanText(value).toLowerCase()
    if (tag && tag.length <= 30 && !seen.has(tag) && !JUNK_TAGS.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }
  return tags.slice(0, 10)
}

function nutritionFrom(value: any): Nutrition | null {
  if (!value || typeof value !== "object") return null
  const number = (field: string) => {
    const match = cleanText(value[field]).match(/\d+(?:[.,]\d+)?/)
    return match ? Number(match[0].replace(",", ".")) : null
  }
  const nutrition: Nutrition = {
    calories: number("calories"),
    fat: number("fatContent"),
    saturatedFat: number("saturatedFatContent"),
    carbohydrates: number("carbohydrateContent"),
    fiber: number("fiberContent"),
    sugar: number("sugarContent"),
    protein: number("proteinContent"),
    sodium: number("sodiumContent"),
    cholesterol: number("cholesterolContent"),
    source: "site",
  }
  const any = Object.entries(nutrition).some(
    ([key, v]) => key !== "source" && v !== null
  )
  return any ? nutrition : null
}

/** Reads schema.org Recipe JSON-LD from a page, or returns null if there isn't any. */
export function extractRecipeFromHtml(
  html: string,
  pageUrl: string
): ExtractedRecipe | null {
  const $ = load(html)
  let node: any = null
  const blocks: unknown[] = []
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim()
    if (!raw) return
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      // Some sites emit control characters or trailing commas; try a cleanup.
      try {
        data = JSON.parse(
          raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")
        )
      } catch {
        return // Not usable; keep looking.
      }
    }
    blocks.push(data)
    node ??= findRecipeNode(data)
  })
  if (!node) return null

  const name = cleanText(node.name)
  const ingredients = asArray(node.recipeIngredient ?? node.ingredients)
    .map(cleanText)
    .filter(Boolean)
  const steps = instructionLines(node.recipeInstructions)
  if (!name || (!ingredients.length && !steps.length)) return null

  const { servings, yieldText } = parseYield(node.recipeYield)
  const description = cleanText(node.description)
  return {
    input: {
      name: name.slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      servings,
      yieldText,
      prepMinutes: parseDuration(node.prepTime),
      cookMinutes: parseDuration(node.cookTime),
      totalMinutes:
        parseDuration(node.totalTime) ??
        ((parseDuration(node.prepTime) ?? 0) +
          (parseDuration(node.cookTime) ?? 0) ||
          null),
      tags: tagsFrom(node),
      ingredients: ingredients.slice(0, 300).map((line) => line.slice(0, 500)),
      steps: steps.slice(0, 200).map((line) => line.slice(0, 5000)),
      nutrition: nutritionFrom(node.nutrition),
      sourceUrl: pageUrl,
    },
    imageUrls: rankPhotos([
      ...imageCandidates(
        node.image ?? node.thumbnailUrl,
        indexIds(blocks),
        pageUrl
      ),
      ...shareImages($, pageUrl).map((url) => ({
        url,
        size: pixels(null, url),
      })),
    ]),
  }
}
