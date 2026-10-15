import type {
  BulkResult,
  ListBulkInput,
  ListPrices,
  PutAwayResult,
  AddFromPlanResult,
  ShoppingItem,
  UpdateListItemInput,
  WeeklyItem,
  WeeklyItemInput,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

export const LIST_KEY = ["list"] as const
const WEEKLY_KEY = ["list", "weekly"] as const
// Under the list's key, so it's fetched again whenever the list changes.
const PRICES_KEY = ["list", "prices"] as const

export function useList() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => (await api<{ items: ShoppingItem[] }>("/list")).items,
  })
}

/** What's left last cost at its list's store, where Nourvio knows the product. */
export function useListPrices() {
  return useQuery({
    queryKey: PRICES_KEY,
    queryFn: async () =>
      (await api<{ prices: ListPrices }>("/shop/prices")).prices,
  })
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: LIST_KEY })
}

/**
 * Selected items all at once. It settles once the list has been fetched
 * again, so Undo's hidden items don't flash back.
 */
export function useListBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ListBulkInput) =>
      api<BulkResult>("/list/bulk", { body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  })
}

export function useAddListItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: string | { text: string; listId?: string }) =>
      (
        await api<{ item: ShoppingItem }>("/list/items", {
          body: typeof input === "string" ? { text: input } : input,
        })
      ).item,
    onSuccess: refresh,
  })
}

/** Changes an item. Checking one off shows straight away, before the server answers. */
export function useUpdateListItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpdateListItemInput & { id: string }) =>
      (
        await api<{ item: ShoppingItem }>(`/list/items/${id}`, {
          method: "PATCH",
          body: input,
        })
      ).item,
    onMutate: async ({ id, checked }) => {
      if (checked === undefined) return
      await queryClient.cancelQueries({ queryKey: LIST_KEY })
      const before = queryClient.getQueryData<ShoppingItem[]>(LIST_KEY)
      queryClient.setQueryData<ShoppingItem[]>(LIST_KEY, (items) =>
        items?.map((item) => (item.id === id ? { ...item, checked } : item))
      )
      return { before }
    },
    onError: (_error, _input, context) => {
      if (context?.before) queryClient.setQueryData(LIST_KEY, context.before)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  })
}

export function useDeleteListItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => api(`/list/items/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  })
}

export function useClearChecked() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () =>
      api<{ removed: number }>("/list/clear-checked", { method: "POST" }),
    onSuccess: refresh,
  })
}

/** Done shopping: checked items go into the pantry. */
export function usePutAway() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PutAwayResult>("/list/put-away", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY })
      queryClient.invalidateQueries({ queryKey: ["pantry"] })
    },
  })
}

export function useAddFromPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (range: { from: string; to: string }) =>
      api<AddFromPlanResult>("/list/from-plan", { body: range }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY })
      queryClient.invalidateQueries({ queryKey: ["plan"] })
    },
  })
}

export function useSaveOnHand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: string[]) =>
      api<{ items: string[] }>("/list/on-hand", {
        method: "PUT",
        body: { items },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["household-info"] }),
  })
}

// ---- Every-week items ----

export function useWeeklyItems(enabled = true) {
  return useQuery({
    queryKey: WEEKLY_KEY,
    queryFn: async () =>
      (await api<{ items: WeeklyItem[] }>("/list/weekly")).items,
    enabled,
  })
}

function useRefreshWeekly() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: WEEKLY_KEY })
}

export function useAddWeeklyItem() {
  const refresh = useRefreshWeekly()
  return useMutation({
    mutationFn: (input: WeeklyItemInput) =>
      api<{ item: WeeklyItem }>("/list/weekly", { body: input }),
    onSuccess: refresh,
  })
}

export function useUpdateWeeklyItem() {
  const refresh = useRefreshWeekly()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<WeeklyItemInput> & { id: string }) =>
      api<{ item: WeeklyItem }>(`/list/weekly/${id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: refresh,
  })
}

export function useDeleteWeeklyItem() {
  const refresh = useRefreshWeekly()
  return useMutation({
    mutationFn: (id: string) => api(`/list/weekly/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  })
}

export function useAddWeeklyToList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ added: number }>("/list/weekly/add-to-list", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  })
}
