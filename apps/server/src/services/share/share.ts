import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { importLink } from "../recipes/import/import-link.ts"
import type { FileStore } from "../storage/files.ts"
import { sharedLinks, type Shared } from "./links.ts"

// Something shared to Merran, from Android's share sheet or an iPhone
// Shortcut, dealt with at once. For now that's a link to a recipe, which is
// imported; photos and text need the assistant, which comes later.

export type ShareOutcome =
  | {
      outcome: "added" | "already"
      code: null
      /** Said in words, so a Shortcut can show it as it is. */
      message: string
      recipe: { id: string; slug: string; name: string }
      /** The recipe's page. */
      url: string
    }
  | {
      outcome: "failed"
      /** Stable, for programs: "no_link", "no_recipe_data" and the like. */
      code: string
      message: string
      recipe: null
      url: null
    }

const failed = (code: string, message: string): ShareOutcome => ({
  outcome: "failed",
  code,
  message,
  recipe: null,
  url: null,
})

/** Works out what was shared, and adds it. */
export async function shareToMerran(
  em: EntityManager,
  deps: { fetcher: Fetcher; files: FileStore },
  options: {
    householdId: string
    userId: string
    shared: Shared
    /** Merran's own address, for the recipe's page. */
    baseUrl: string
  }
): Promise<ShareOutcome> {
  const { shared } = options
  if (shared.files.length === 0 && !shared.text) {
    return failed("nothing_shared", "Nothing came through to share.")
  }
  const links = sharedLinks(shared)
  if (links.length === 0) {
    return failed(
      "no_link",
      "Merran can only add recipes from links for now. Share the recipe's web page."
    )
  }
  if (links.length > 1) {
    return failed("several_links", "Share one link at a time for now.")
  }

  try {
    const { recipe, duplicate } = await importLink(em, deps, {
      householdId: options.householdId,
      userId: options.userId,
      url: links[0]!,
    })
    return {
      outcome: duplicate ? "already" : "added",
      code: null,
      message: duplicate
        ? `${recipe.name} is in Merran already.`
        : `Added ${recipe.name} to Merran.`,
      recipe: { id: recipe.id, slug: recipe.slug, name: recipe.name },
      url: `${options.baseUrl}/recipes/${recipe.slug}`,
    }
  } catch (err) {
    // Why the link couldn't come in, as the link import says it.
    if (err instanceof AppError) return failed(err.code, err.message)
    throw err
  }
}
