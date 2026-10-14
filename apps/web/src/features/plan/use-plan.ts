import type {
  AddPlanEntriesInput,
  AddPlanEntryInput,
  MealSuggestion,
  PlanEntry,
  SuggestMealsInput,
  UpdatePlanEntryInput,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAN_KEY })
      // Cooking a meal (or taking it back) changes the pantry.
      queryClient.invalidateQueries({ queryKey: ["pantry"] })
    },
  })
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
