import { z } from "zod"

/** A recipe in a starter collection: a page that imports cleanly. */
export type StarterRecipe = {
  url: string
  title: string
  site: string
  minutes: number | null
  /** The page's photo, fetched through Nourvio to show. */
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
  /** A photo through Nourvio, or null. */
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

/** A recipe site with a feed, checked to work with Nourvio, offered to follow. */
export type SuggestedSite = {
  name: string
  url: string
  feedUrl: string
  description: string
}

export const SUGGESTED_SITES: SuggestedSite[] = [
  {
    name: "RecipeTin Eats",
    url: "https://www.recipetineats.com/",
    feedUrl: "https://www.recipetineats.com/feed/",
    description:
      "Reliable, well-tested dinners from Sydney, from weeknight to show-off.",
  },
  {
    name: "BBC Good Food",
    url: "https://www.bbcgoodfood.com/",
    feedUrl: "https://www.bbcgoodfood.com/feed",
    description: "Triple-tested British home cooking and easy classics.",
  },
  {
    name: "Love and Lemons",
    url: "https://www.loveandlemons.com/",
    feedUrl: "https://www.loveandlemons.com/feed/",
    description: "Bright, seasonal vegetarian cooking.",
  },
  {
    name: "Pinch of Yum",
    url: "https://pinchofyum.com/",
    feedUrl: "https://pinchofyum.com/feed",
    description: "Cozy, approachable comfort food.",
  },
  {
    name: "Once Upon a Chef",
    url: "https://www.onceuponachef.com/",
    feedUrl: "https://www.onceuponachef.com/feed",
    description: "Polished, foolproof versions of family favorites.",
  },
  {
    name: "Inspired Taste",
    url: "https://www.inspiredtaste.net/",
    feedUrl: "https://www.inspiredtaste.net/feed/",
    description: "Simple recipes with clear steps and lots of photos.",
  },
  {
    name: "Natasha's Kitchen",
    url: "https://natashaskitchen.com/",
    feedUrl: "https://natashaskitchen.com/feed/",
    description: "Crowd-pleasing family dinners and desserts.",
  },
  {
    name: "Bon Appétit",
    url: "https://www.bonappetit.com/recipes",
    feedUrl: "https://www.bonappetit.com/feed/recipes-rss-feed/rss",
    description: "The magazine's newest recipes, from test kitchen to table.",
  },
  {
    name: "Just One Cookbook",
    url: "https://www.justonecookbook.com/",
    feedUrl: "https://www.justonecookbook.com/feed/",
    description: "Japanese home cooking, explained step by step.",
  },
  {
    name: "Minimalist Baker",
    url: "https://minimalistbaker.com/",
    feedUrl: "https://minimalistbaker.com/feed/",
    description: "Plant-based recipes with 10 ingredients or fewer.",
  },
  {
    name: "Skinnytaste",
    url: "https://www.skinnytaste.com/",
    feedUrl: "https://www.skinnytaste.com/feed/",
    description: "Lighter takes on everyday favorites.",
  },
]

/** A recipe from a followed site's feed. */
export type SiteRecipe = FoundRecipe & {
  publishedAt: string | null
  /** The recipe's own short description, when the site gives one. */
  description: string | null
}

/** A site the household follows, with its newest recipes. */
export type FollowedSite = {
  id: string
  name: string
  url: string
  feedUrl: string
  /** Newest first: only posts Nourvio opened and read as recipes. */
  recipes: SiteRecipe[]
  /** New posts not opened yet. */
  pending: number
  /** Opening them now, a few seconds apart. */
  checking: boolean
  checkedAt: string | null
  error: string | null
}

export const followSiteInput = z.object({
  url: z.string().trim().min(3, "Paste the site's address").max(500),
})
