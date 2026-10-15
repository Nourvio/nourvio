import { z } from "zod"

/** Where each link in a bulk import has got to. */
export const IMPORT_ITEM_STATES = [
  "waiting",
  "importing",
  "added",
  "duplicate",
  "failed",
  "stopped",
] as const
export type ImportItemState = (typeof IMPORT_ITEM_STATES)[number]

/** One link in a bulk import. */
export type ImportItem = {
  id: string
  url: string
  /** Videos go one at a time and take longer; pages go three at a time. */
  kind: "video" | "page"
  state: ImportItemState
  /** The recipe it made, or already was. */
  recipe: {
    id: string
    slug: string
    name: string
    thumbnailUrl: string | null
  } | null
  /** Why it didn't work. */
  error: string | null
}

/** Many links imported in the background (Recipes → Paste several links). */
export type ImportBatch = {
  id: string
  createdAt: string
  finishedAt: string | null
  /** Added to every recipe it makes, like "to try". */
  tag: string | null
  items: ImportItem[]
}

/** How a bulk import is going, for the chip on Recipes. */
export type ImportBatchSummary = {
  id: string
  total: number
  /** Finished one way or another. */
  done: number
  added: number
  failed: number
  finishedAt: string | null
}

/** A link found in pasted text, before importing. */
export type LinkPreview = {
  url: string
  kind: "video" | "page"
  /** Already in the library: skipped. */
  existing: { slug: string; name: string } | null
}

const webLink = z.url({ protocol: /^https?$/ }).max(2000)

export const importBatchInput = z.object({
  urls: z
    .array(webLink)
    .min(1, "Paste at least one link")
    .max(100, "Up to 100 links at a time"),
  tag: z.string().trim().min(1).max(40).nullable().optional(),
})
export type ImportBatchInput = z.infer<typeof importBatchInput>

export const previewLinksInput = z.object({
  text: z.string().max(100_000),
})

/** Every http(s) link in some text, once each, in order. */
export function findLinks(text: string) {
  const found = text.match(/https?:\/\/[^\s<>"'()[\]]+/g) ?? []
  const seen = new Set<string>()
  const links: string[] = []
  for (const raw of found) {
    const link = raw.replace(/[).,;!?]+$/, "")
    if (seen.has(link)) continue
    seen.add(link)
    links.push(link)
  }
  return links
}
