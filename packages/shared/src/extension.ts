import { z } from "zod"

/** A browser the Mise extension is connected in, by its token. */
export type ExtensionToken = {
  id: string
  /** "Chrome on Windows" */
  name: string
  createdAt: string
  lastUsedAt: string | null
}

/** Personal API tokens start with this, so they're easy to spot. */
export const API_TOKEN_PREFIX = "mise_"

export const createExtensionTokenInput = z.object({
  name: z.string().trim().min(1).max(80),
})

/**
 * A page as the browser shows it, read by the extension: its recipe data
 * (JSON-LD), photos and readable text. Works on sites that turn Mise's
 * server away, or that need the person's own subscription.
 */
export const importPageInput = z.object({
  url: z.string().trim().min(1).max(2000),
  title: z.string().max(500).optional(),
  jsonld: z.array(z.string().max(400_000)).max(20).default([]),
  images: z.array(z.string().max(2000)).max(10).default([]),
  text: z.string().max(80_000).default(""),
  /** Import again even if a recipe from this link already exists. */
  force: z.boolean().optional(),
})
export type ImportPageInput = z.input<typeof importPageInput>
