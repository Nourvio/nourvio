import * as React from "react"
import type { BrowseCollection, FoundRecipe, ImportResult } from "@mise/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { RECIPES_KEY } from "@/features/recipes/use-recipes"
import { api, ApiError } from "@/lib/api"

export const COLLECTIONS_KEY = ["collections"] as const

export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: async () =>
      (await api<{ collections: BrowseCollection[] }>("/collections"))
        .collections,
    staleTime: 5 * 60_000,
  })
}

/**
 * Importing recipes found on the web, one or several in a row, keeping
 * track of which are on their way. Browsing lists refresh after, so cards
 * show what's in the library.
 */
export function useImportFound() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [importing, setImporting] = React.useState<Set<string>>(new Set())
  const [progress, setProgress] = React.useState<{
    done: number
    total: number
  } | null>(null)

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
    queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY })
    queryClient.invalidateQueries({ queryKey: ["discover"] })
    queryClient.invalidateQueries({ queryKey: ["sites"] })
  }, [queryClient])

  async function importOne(recipe: FoundRecipe) {
    setImporting((current) => new Set(current).add(recipe.url))
    try {
      const result = await api<ImportResult>("/import/url", {
        body: { url: recipe.url },
      })
      queryClient.setQueryData(["recipe", result.recipe.slug], result.recipe)
      return result
    } finally {
      setImporting((current) => {
        const next = new Set(current)
        next.delete(recipe.url)
        return next
      })
    }
  }

  async function add(recipe: FoundRecipe) {
    try {
      const result = await importOne(recipe)
      toast.success(`Imported ${result.recipe.name}`, {
        action: {
          label: "Open",
          onClick: () => navigate(`/recipes/${result.recipe.slug}`),
        },
      })
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't import that"
      )
    } finally {
      refresh()
    }
  }

  /** One after another, so sites aren't hit all at once. */
  async function addAll(recipes: FoundRecipe[]) {
    const todo = recipes.filter((recipe) => !recipe.inLibrary)
    if (!todo.length) return
    let imported = 0
    setProgress({ done: 0, total: todo.length })
    for (const [index, recipe] of todo.entries()) {
      try {
        await importOne(recipe)
        imported++
      } catch {
        // Counted below; the rest carry on.
      }
      setProgress({ done: index + 1, total: todo.length })
      // Keep the cards up to date as they arrive.
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY })
    }
    setProgress(null)
    refresh()
    const missed = todo.length - imported
    if (missed) {
      toast.warning(
        `Imported ${imported} of ${todo.length}. ${missed === 1 ? "One site" : `${missed} sites`} couldn't be opened just now.`
      )
    } else {
      toast.success(
        `Imported ${imported} ${imported === 1 ? "recipe" : "recipes"}`
      )
    }
  }

  return { importing, progress, add, addAll }
}
