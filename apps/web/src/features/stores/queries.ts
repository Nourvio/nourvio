import { worthIt } from "@merran/shared"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"

import { useCapability } from "@/features/capabilities/queries"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type StoresStatus = Schemas["StoresStatus"]
export type StoreLocation = Schemas["StoreLocation"]
export type StoreProduct = Schemas["StoreProduct"]
export type Basket = Schemas["Basket"]
export type BasketLine = Schemas["BasketLine"]
export type Deals = Schemas["Deals"]
export type RecipeSale = Deals["recipes"][string][number]

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

/** What's on sale at the household's store, and the recipes it's in. */
export const dealsQuery = queryOptions({
  queryKey: ["stores", "deals"],
  queryFn: () => unwrap(api.GET("/api/stores/deals")),
  staleTime: 10 * 60_000,
})

/**
 * The household's deals when it has a Kroger store: each recipe's real
 * deals (not those barely off), and whether there are any.
 */
export function useDeals() {
  const on = useCapability("stores.kroger")
  const { data } = useQuery({ ...dealsQuery, enabled: on })
  const recipes = new Map(
    Object.entries(data?.recipes ?? {}).flatMap(([id, sales]) => {
      const worth = sales.filter((sale) => worthIt(sale.verdict))
      return worth.length > 0 ? [[id, worth] as const] : []
    })
  )
  return { data, recipes, any: recipes.size > 0 }
}

/** Keeps the household's stores after a change. */
export function useSetStores() {
  const queryClient = useQueryClient()
  return (status: StoresStatus) => {
    queryClient.setQueryData(storesQuery.queryKey, status)
    void queryClient.invalidateQueries({ queryKey: krogerBasketQuery.queryKey })
    void queryClient.invalidateQueries({ queryKey: dealsQuery.queryKey })
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
