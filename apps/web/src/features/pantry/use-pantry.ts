import type {
  BulkResult,
  PantryBulkInput,
  PantryItem,
  UpdatePantryItemInput,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

export const PANTRY_KEY = ["pantry"] as const

export function usePantry() {
  return useQuery({
    queryKey: PANTRY_KEY,
    queryFn: async () => (await api<{ items: PantryItem[] }>("/pantry")).items,
  })
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: PANTRY_KEY })
}

/**
 * Selected items all at once. It settles once the pantry (and the list,
 * when things went on it) has been fetched again.
 */
export function usePantryBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PantryBulkInput) =>
      api<BulkResult>("/pantry/bulk", { body: input }),
    onSuccess: (_result, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: PANTRY_KEY }),
        input.action === "toList" &&
          queryClient.invalidateQueries({ queryKey: ["list"] }),
      ]),
  })
}

export function useAddPantryItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (text: string) =>
      (await api<{ item: PantryItem }>("/pantry", { body: { text } })).item,
    onSuccess: refresh,
  })
}

export function useUpdatePantryItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpdatePantryItemInput & { id: string }) =>
      (
        await api<{ item: PantryItem }>(`/pantry/${id}`, {
          method: "PATCH",
          body: input,
        })
      ).item,
    onSuccess: refresh,
  })
}

/** Used up, or thrown out. */
export function useRemovePantryItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => api(`/pantry/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  })
}
