import type { Nutrition, RecipeInput } from "@mise/shared"
import { load } from "cheerio"

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD is untyped by nature */

export type ExtractedRecipe = {
  input: RecipeInput
  imageUrl: string | null
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

function imageFrom(value: unknown, base: string): string | null {
  for (const item of asArray(value)) {
    const url =
      typeof item === "string" ? item : (item?.url ?? item?.contentUrl)
    if (typeof url === "string" && url.trim()) {
      try {
        return new URL(url.trim(), base).toString()
      } catch {
        continue
      }
    }
  }
  return null
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
  $('script[type="application/ld+json"]').each((_, element) => {
    if (node) return
    const raw = $(element).text().trim()
    if (!raw) return
    try {
      node = findRecipeNode(JSON.parse(raw))
    } catch {
      // Some sites emit control characters or trailing commas; try a cleanup.
      try {
        node = findRecipeNode(
          JSON.parse(
            raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")
          )
        )
      } catch {
        // Not usable; keep looking.
      }
    }
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
    imageUrl: imageFrom(node.image ?? node.thumbnailUrl, pageUrl),
  }
}
