import type {
  AddPlanEntriesInput,
  AddPlanEntryInput,
  MealSuggestion,
  PlanEntry,
  SuggestMealsInput,
  UpdatePlanEntryInput,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, ApiError } from "@/lib/api"

export const PLAN_KEY = ["plan"] as const

export function usePlan(from: string, to: string) {
  return useQuery({
    queryKey: [...PLAN_KEY, from, to],
    queryFn: async () =>
      (await api<{ entries: PlanEntry[] }>(`/plan?from=${from}&to=${to}`))
        .entries,
  })
}

export function useAddPlanEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddPlanEntryInput) =>
      (await api<{ entry: PlanEntry }>("/plan/entries", { body: input })).entry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_KEY }),
  })
}

export function useUpdatePlanEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpdatePlanEntryInput & { id: string }) =>
      (
        await api<{ entry: PlanEntry }>(`/plan/entries/${id}`, {
          method: "PATCH",
          body: input,
        })
      ).entry,
    onSuccess: (_entry, input) => {
      queryClient.invalidateQueries({ queryKey: PLAN_KEY })
      // Cooking a meal (or taking it back) changes the pantry...
      queryClient.invalidateQueries({ queryKey: ["pantry"] })
      // ...and when its recipes were last made.
      if (input.status) {
        queryClient.invalidateQueries({ queryKey: ["recipes"] })
        queryClient.invalidateQueries({ queryKey: ["recipe"] })
      }
    },
  })
}

/**
 * Marks a planned meal cooked, skipped or planned again, saying what was
 * taken out of (or put back in) the pantry.
 */
export function useSetEntryStatus() {
  const update = useUpdatePlanEntry()
  function setStatus(
    entry: PlanEntry,
    status: PlanEntry["status"],
    message: string,
    { onDone }: { onDone?: () => void } = {}
  ) {
    const names = (list: string[]) => list.join(", ").toLowerCase()
    update.mutate(
      { id: entry.id, status },
      {
        onSuccess: (updated) => {
          toast.success(message, {
            description: updated.pantryUsed.length
              ? `Took ${names(updated.pantryUsed)} out of the pantry.`
              : entry.pantryUsed.length
                ? `Put ${names(entry.pantryUsed)} back in the pantry.`
                : undefined,
          })
          onDone?.()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }
  return { setStatus, isPending: update.isPending }
}

export function useRemovePlanEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/plan/entries/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_KEY }),
  })
}

const suggest = async (input: SuggestMealsInput) =>
  (
    await api<{ suggestions: MealSuggestion[] }>("/plan/suggest", {
      body: input,
    })
  ).suggestions

/**
 * Recipe ideas for empty meals, fetched once per set of slots. Nothing is
 * added until they're accepted.
 */
export function useMealSuggestions(slots: SuggestMealsInput["slots"]) {
  return useQuery({
    queryKey: ["plan-suggestions", slots],
    queryFn: () => suggest({ slots }),
    enabled: slots.length > 0,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** One more idea, for re-rolling a suggestion or swapping a planned meal. */
export function useSuggestMeal() {
  return useMutation({ mutationFn: suggest })
}

export function useAddPlanEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entries: AddPlanEntriesInput["entries"]) =>
      (
        await api<{ entries: PlanEntry[] }>("/plan/entries/batch", {
          body: { entries },
        })
      ).entries,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_KEY }),
  })
}

/** Swaps a planned meal for another recipe that suits it, with an undo. */
export function useSwapEntry() {
  const suggestOne = useSuggestMeal()
  const update = useUpdatePlanEntry()
  function swap(entry: PlanEntry) {
    const { recipe } = entry
    if (!recipe) return
    const onError = (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't swap that"
      )
    suggestOne.mutate(
      { slots: [{ date: entry.date, meal: entry.meal }], exclude: [recipe.id] },
      {
        onSuccess: ([next]) => {
          if (!next) {
            toast("No other ideas for this one. More recipes, more variety.")
            return
          }
          update.mutate(
            { id: entry.id, recipeId: next.recipe.id },
            {
              onSuccess: () =>
                toast.success(`Swapped in ${next.recipe.name}`, {
                  action: {
                    label: "Undo",
                    onClick: () =>
                      update.mutate({
                        id: entry.id,
                        recipeId: recipe.id,
                        servings: entry.servings ?? undefined,
                      }),
                  },
                }),
              onError,
            }
          )
        },
        onError,
      }
    )
  }
  return { swap, isPending: suggestOne.isPending || update.isPending }
}
