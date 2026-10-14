import type {
  AddPlanEntryInput,
  PlanEntry,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_KEY }),
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
