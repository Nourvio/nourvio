import type { PantryItem, UpdatePantryItemInput } from "@mise/shared"
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
