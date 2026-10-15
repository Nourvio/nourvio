import * as React from "react"
import type {
  BrowseCollection,
  Discovery,
  FollowedSite,
  FoundRecipe,
  ImportResult,
  Meal,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { PLAN_KEY } from "@/features/plan/use-plan"
import { RECIPES_KEY } from "@/features/recipes/use-recipes"
import { api, ApiError } from "@/lib/api"

export const COLLECTIONS_KEY = ["collections"] as const
export const DISCOVER_KEY = ["discover"] as const
export const SITES_KEY = ["sites"] as const

export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: async () =>
      (await api<{ collections: BrowseCollection[] }>("/collections"))
        .collections,
    staleTime: 5 * 60_000,
  })
}

/** Recent searches with AI, checked every few seconds while one is running. */
export function useDiscoveries() {
  return useQuery({
    queryKey: DISCOVER_KEY,
    queryFn: async () =>
      (await api<{ discoveries: Discovery[] }>("/discover")).discoveries,
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "searching")
        ? 3000
        : false,
  })
}

export function useStartDiscovery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (theme: string) =>
      (
        await api<{ discovery: Discovery }>("/discover", {
          body: { theme },
        })
      ).discovery,
    onSuccess: (discovery) => {
      queryClient.setQueryData<Discovery[]>(DISCOVER_KEY, (current) => [
        discovery,
        ...(current ?? []),
      ])
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't start that search"
      )
    },
  })
}

/** Followed sites, checked every few seconds while new posts are being opened. */
export function useSites() {
  return useQuery({
    queryKey: SITES_KEY,
    queryFn: async () => (await api<{ sites: FollowedSite[] }>("/sites")).sites,
    refetchInterval: (query) =>
      query.state.data?.some((site) => site.checking) ? 4000 : false,
  })
}

export function useFollowSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (url: string) =>
      (await api<{ site: FollowedSite }>("/sites", { body: { url } })).site,
    onSuccess: (site) => {
      queryClient.setQueryData<FollowedSite[]>(SITES_KEY, (current) =>
        [...(current ?? []), site].sort((a, b) => a.name.localeCompare(b.name))
      )
      toast.success(`Following ${site.name}`)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't follow that site"
      )
    },
  })
}

export function useUnfollowSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (site: FollowedSite) => {
      await api(`/sites/${site.id}`, { method: "DELETE" })
      return site
    },
    onSuccess: (site) => {
      queryClient.setQueryData<FollowedSite[]>(SITES_KEY, (current) =>
        (current ?? []).filter((item) => item.id !== site.id)
      )
      toast.success(`Stopped following ${site.name}`)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't unfollow that"
      )
    },
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
    queryClient.invalidateQueries({ queryKey: DISCOVER_KEY })
    queryClient.invalidateQueries({ queryKey: SITES_KEY })
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
      queryClient.invalidateQueries({ queryKey: DISCOVER_KEY })
      queryClient.invalidateQueries({ queryKey: SITES_KEY })
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

/** Imports a recipe from the web and plans it for a meal, in one go. */
export function useImportAndPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      url,
      date,
      meal,
    }: {
      url: string
      date: string
      meal: Meal
    }) => {
      const { recipe } = await api<ImportResult>("/import/url", {
        body: { url },
      })
      await api("/plan/entries", { body: { date, meal, recipeId: recipe.id } })
      return recipe
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      queryClient.invalidateQueries({ queryKey: SITES_KEY })
      queryClient.invalidateQueries({ queryKey: PLAN_KEY })
    },
  })
}
