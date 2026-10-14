import { z } from "zod"

/** A recipe in a starter collection: a page that imports cleanly. */
export type StarterRecipe = {
  url: string
  title: string
  site: string
  minutes: number | null
  /** The page's photo, fetched through Mise to show. */
  image: string | null
}

export type StarterCollection = {
  id: string
  title: string
  description: string
  recipes: StarterRecipe[]
}

/** A recipe out on the web, as the app shows it before importing. */
export type FoundRecipe = {
  url: string
  title: string
  site: string
  minutes: number | null
  /** A photo through Mise, or null. */
  imageUrl: string | null
  /** Already in the library, under this recipe. */
  inLibrary: { slug: string; name: string } | null
}

export type BrowseCollection = {
  id: string
  title: string
  description: string
  recipes: FoundRecipe[]
}

/** A recipe the assistant found for a theme, with why it picked it. */
export type DiscoveredRecipe = FoundRecipe & { why: string }

/** One search for recipes on a theme, kept so it can be looked at again. */
export type Discovery = {
  id: string
  theme: string
  /** "searching" until the recipes are found and checked. */
  status: "searching" | "done" | "failed"
  error: string | null
  recipes: DiscoveredRecipe[]
  createdAt: string
}

export const discoverInput = z.object({
  theme: z.string().trim().min(2, "Say what you're after").max(120),
})

/** Ideas to start from; any theme can be typed instead. */
export const DISCOVER_THEMES = [
  "Cozy soups and stews",
  "30-minute dinners",
  "Sheet-pan suppers",
  "Slow cooker favorites",
  "Make-ahead lunches",
  "Vegetarian weeknights",
  "Date night in",
  "Something new to try",
] as const
