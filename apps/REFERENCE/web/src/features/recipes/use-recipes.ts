import { toIsoDate } from "@mise/shared"
import type {
  BulkResult,
  DeletedRecipe,
  RecipeBulkInput,
  RecipeCosts,
  AddCookNoteInput,
  AddCookNoteResult,
  AddPairingsInput,
  CookNote,
  DietOverrides,
  Recipe,
  RecipeInput,
  RecipePairings,
  RecipeSummary,
  RecipeVersion,
  Substitute,
  StepChange,
  SwapResult,
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

/** What every recipe costs at the household's stores, as far as Nourvio knows. */
export function useRecipeCosts() {
  return useQuery({
    queryKey: [...RECIPES_KEY, "costs"],
    queryFn: async () =>
      (await api<{ costs: RecipeCosts }>("/recipes/costs")).costs,
    staleTime: 5 * 60_000,
  })
}

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
  const generate = useMutation({
    mutationKey: photoMutationKey(id),
    mutationFn: async () =>
      (
        await api<{ recipe: Recipe }>(`/recipes/${id}/photo`, {
          method: "POST",
        })
      ).recipe,
    onSuccess: saved,
  })
  return { upload, remove, generate }
}

/** What to use instead of an ingredient, asked once per ingredient. */
export function useSubstitutes(recipeId: string, ingredientId: string | null) {
  return useQuery({
    queryKey: ["substitutes", recipeId, ingredientId],
    queryFn: async () =>
      (
        await api<{ substitutes: Substitute[] }>(
          `/recipes/${recipeId}/substitutes`,
          { body: { ingredientId } }
        )
      ).substitutes,
    enabled: ingredientId !== null,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/** Puts a substitute in the recipe for good. */
export function useSwapIngredient(recipeId: string) {
  const saved = useRecipeSaved()
  return useMutation({
    mutationFn: (input: {
      ingredientId: string
      lines: string[]
      steps?: StepChange[]
    }) => api<SwapResult>(`/recipes/${recipeId}/swap`, { body: input }),
    onSuccess: ({ recipe }) => saved(recipe),
  })
}

const cookNotesKey = (recipeId: string) => ["cook-notes", recipeId] as const

/** "How did it go?" notes left after cooking, newest first. */
export function useCookNotes(recipeId: string) {
  return useQuery({
    queryKey: cookNotesKey(recipeId),
    queryFn: async () =>
      (await api<{ notes: CookNote[] }>(`/recipes/${recipeId}/cook-notes`))
        .notes,
  })
}

export function useAddCookNote(recipeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddCookNoteInput) =>
      api<AddCookNoteResult>(`/recipes/${recipeId}/cook-notes`, {
        body: input,
      }),
    onSuccess: (result, input) => {
      queryClient.invalidateQueries({ queryKey: cookNotesKey(recipeId) })
      if (input.rating !== null) {
        queryClient.invalidateQueries({ queryKey: ["recipe"] })
        queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      }
      // The note is being turned into a suggested change: look for it a few
      // times over the next minute, so it shows up on the recipe by itself.
      if (result.suggesting) {
        for (const seconds of [6, 12, 20, 35, 60]) {
          setTimeout(
            () =>
              queryClient.invalidateQueries({
                queryKey: ["proposal", recipeId],
              }),
            seconds * 1000
          )
        }
      }
    },
  })
}

export function useDeleteCookNote(recipeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) =>
      api(`/recipes/${recipeId}/cook-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cookNotesKey(recipeId) }),
  })
}

/** For telling, anywhere on the page, that a photo is being made. */
export const photoMutationKey = (id: string) => ["recipe-photo", id] as const

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
  })
}

/** Something done to many recipes at once (Select on Recipes). */
export function useRecipeBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecipeBulkInput) =>
      api<BulkResult>("/recipes/bulk", { body: input }),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      void queryClient.invalidateQueries({ queryKey: ["recipe"] })
      if (input.action === "toList") {
        void queryClient.invalidateQueries({ queryKey: ["list"] })
      }
      if (["delete", "restore", "purge"].includes(input.action)) {
        void queryClient.invalidateQueries({ queryKey: ["plan"] })
      }
    },
  })
}

/** What's in Recently deleted. */
export function useDeletedRecipes() {
  return useQuery({
    queryKey: [...RECIPES_KEY, "deleted"],
    queryFn: async () =>
      (await api<{ recipes: DeletedRecipe[] }>("/recipes/deleted")).recipes,
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
