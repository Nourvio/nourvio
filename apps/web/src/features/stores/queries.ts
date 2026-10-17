import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type StoresStatus = Schemas["StoresStatus"]
export type StoreLocation = Schemas["StoreLocation"]
export type StoreProduct = Schemas["StoreProduct"]
export type Basket = Schemas["Basket"]
export type BasketLine = Schemas["BasketLine"]

/** The household's stores with an API: its Kroger, and the linked account. */
export const storesQuery = queryOptions({
  queryKey: ["stores"],
  queryFn: () => unwrap(api.GET("/api/stores")),
})

/** What the list is at Kroger: a product for each thing, and how many. */
export const krogerBasketQuery = queryOptions({
  queryKey: ["stores", "kroger", "basket"],
  queryFn: () => unwrap(api.GET("/api/stores/kroger/basket")),
  // Kroger's search and an AI pick: not something to redo on every focus.
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
})

/** Keeps the household's stores after a change. */
export function useSetStores() {
  const queryClient = useQueryClient()
  return (status: StoresStatus) => {
    queryClient.setQueryData(storesQuery.queryKey, status)
    void queryClient.invalidateQueries({ queryKey: krogerBasketQuery.queryKey })
  }
}

/** A price in cents, in the store's currency. */
export function formatPrice(
  cents: number,
  currency: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100
  )
}
