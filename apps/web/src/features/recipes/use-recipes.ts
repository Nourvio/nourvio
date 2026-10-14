import { toIsoDate } from "@mise/shared"
import type {
  AddPairingsInput,
  DietOverrides,
  Recipe,
  RecipeInput,
  RecipePairings,
  RecipeSummary,
  RecipeVersion,
  Tag,
} from "@mise/shared"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api, apiUpload } from "@/lib/api"

export const RECIPES_KEY = ["recipes"] as const

const recipeKey = (idOrSlug: string) => ["recipe", idOrSlug] as const

export function useRecipes(filters: { q?: string; tag?: string } = {}) {
  const params = new URLSearchParams()
  if (filters.q) params.set("q", filters.q)
  if (filters.tag) params.set("tag", filters.tag)
  const query = params.toString()
  return useQuery({
    queryKey: [...RECIPES_KEY, query],
    queryFn: async () =>
      (
        await api<{ recipes: RecipeSummary[] }>(
          `/recipes${query ? `?${query}` : ""}`
        )
      ).recipes,
    placeholderData: keepPreviousData,
  })
}

export function useTags() {
  return useQuery({
    queryKey: [...RECIPES_KEY, "tags"],
    queryFn: async () => (await api<{ tags: Tag[] }>("/recipes/tags")).tags,
  })
}

/** Renames a tag everywhere; a name that exists already merges the two. */
export function useRenameTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api(`/recipes/tags/${encodeURIComponent(from)}`, {
        method: "PATCH",
        body: { name: to },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      queryClient.invalidateQueries({ queryKey: ["recipe"] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api(`/recipes/tags/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      queryClient.invalidateQueries({ queryKey: ["recipe"] })
    },
  })
}

export function useRecipe(idOrSlug: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: recipeKey(idOrSlug),
    queryFn: async () =>
      (await api<{ recipe: Recipe }>(`/recipes/${idOrSlug}`)).recipe,
    enabled: enabled && Boolean(idOrSlug),
  })
}

const PAIRINGS_KEY = ["pairings"] as const

/** What a recipe goes with, and what it's offered with. */
export function usePairings(id: string) {
  return useQuery({
    queryKey: [...PAIRINGS_KEY, id],
    queryFn: () => api<RecipePairings>(`/recipes/${id}/pairings`),
  })
}

export function useAddPairings(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddPairingsInput) =>
      api<RecipePairings>(`/recipes/${id}/pairings`, { body: input }),
    // Other recipes' "pairs with" change too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAIRINGS_KEY }),
  })
}

export function useRemovePairing(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pairingId: string) =>
      api<RecipePairings>(`/recipes/${id}/pairings/${pairingId}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAIRINGS_KEY }),
  })
}

/** After any change: store the fresh recipe under both keys and refresh lists. */
function useRecipeSaved() {
  const queryClient = useQueryClient()
  return (recipe: Recipe) => {
    queryClient.setQueryData(recipeKey(recipe.slug), recipe)
    queryClient.setQueryData(recipeKey(recipe.id), recipe)
    queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
    queryClient.invalidateQueries({ queryKey: ["recipe-versions", recipe.id] })
  }
}

export function useCreateRecipe() {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async (input: RecipeInput) =>
      (await api<{ recipe: Recipe }>("/recipes", { body: input })).recipe,
    onSuccess: saved,
  })
}

export function useUpdateRecipe(id: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async (input: RecipeInput) =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}`, {
          method: "PUT",
          body: input,
        })
      ).recipe,
    onSuccess: saved,
  })
}

export function useRateRecipe(id: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async (rating: number | null) =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}`, {
          method: "PATCH",
          body: { rating },
        })
      ).recipe,
    onSuccess: saved,
  })
}

/** "I made this", today. A meal planned for today with this recipe counts as cooked. */
/** Corrections to the diet labels the ingredients suggest. */
export function useSetDiets(id: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async (overrides: DietOverrides) =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}/diets`, {
          method: "PUT",
          body: { overrides },
        })
      ).recipe,
    onSuccess: saved,
  })
}

/** Works out nutrition now: USDA data, or an AI estimate. */
export function useWorkOutNutrition(id: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async () =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}/nutrition`, {
          method: "POST",
        })
      ).recipe,
    onSuccess: saved,
  })
}

export function useMarkMade(id: string) {
  const saved = useRecipeSaved()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}/made`, {
          body: { date: toIsoDate(new Date()) },
        })
      ).recipe,
    onSuccess: (recipe) => {
      saved(recipe)
      queryClient.invalidateQueries({ queryKey: ["plan"] })
      // A planned meal cooked today takes its ingredients out of the pantry.
      queryClient.invalidateQueries({ queryKey: ["pantry"] })
    },
  })
}

export function useRecipePhoto(id: string) {
  const saved = useRecipeSaved()
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("image", file)
      return (await apiUpload<{ recipe: Recipe }>(`/recipes/${id}/image`, form))
        .recipe
    },
    onSuccess: saved,
  })
  const remove = useMutation({
    mutationFn: async () =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}/image`, {
          method: "DELETE",
        })
      ).recipe,
    onSuccess: saved,
  })
  return { upload, remove }
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
  })
}

export function useRecipeVersions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["recipe-versions", id],
    queryFn: async () =>
      (await api<{ versions: RecipeVersion[] }>(`/recipes/${id}/versions`))
        .versions,
    enabled,
  })
}

export function useRestoreVersion(id: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: async (versionId: string) =>
      (
        await api<{ recipe: Recipe }>(
          `/recipes/${id}/versions/${versionId}/restore`,
          { method: "POST" }
        )
      ).recipe,
    onSuccess: saved,
  })
}
