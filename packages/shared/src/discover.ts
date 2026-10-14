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
