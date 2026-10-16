import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { importLink } from "../recipes/import/import-link.ts"
import { MAX_LINKS, startLinkImport } from "../recipes/import/import-links.ts"
import type { FileStore } from "../storage/files.ts"
import { sharedLinks, type Shared } from "./links.ts"

// Something shared to Merran, from Android's share sheet or an iPhone
// Shortcut, dealt with at once. For now that's links to recipes: one is
// imported there and then, several start an import that goes on in the
// background. Photos and text need the assistant, which comes later.

type Base = {
  /** Said in words, so a Shortcut can show it as it is. */
  message: string
}

export type ShareOutcome = Base &
  (
    | {
        outcome: "added" | "already"
        code: null
        recipe: { id: string; slug: string; name: string }
        importId: null
        /** The recipe's page. */
        url: string
      }
    | {
        outcome: "importing"
        code: null
        recipe: null
        /** The import, to follow at /recipes/import/links/{importId}. */
        importId: string
        /** Its page. */
        url: string
      }
    | {
        outcome: "failed"
        /** Stable, for programs: "no_link", "no_recipe_data" and the like. */
        code: string
        recipe: null
        importId: null
        url: null
      }
  )

const failed = (code: string, message: string): ShareOutcome => ({
  outcome: "failed",
  code,
  message,
  recipe: null,
  importId: null,
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
    /** Merran's own address, for the pages it links to. */
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

  try {
    if (links.length > 1) {
      const job = await startLinkImport(em, {
        householdId: options.householdId,
        userId: options.userId,
        urls: links,
      })
      const count = Math.min(links.length, MAX_LINKS)
      return {
        outcome: "importing",
        code: null,
        message: `Adding ${count} recipes to Merran.`,
        recipe: null,
        importId: job.id,
        url: `${options.baseUrl}/recipes/import/${job.id}`,
      }
    }

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
      importId: null,
      url: `${options.baseUrl}/recipes/${recipe.slug}`,
    }
  } catch (err) {
    // Why the link couldn't come in, as the link import says it.
    if (err instanceof AppError) return failed(err.code, err.message)
    throw err
  }
}
