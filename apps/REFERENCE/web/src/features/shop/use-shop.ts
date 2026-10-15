import type {
  Basket,
  BasketLine,
  Deals,
  KrogerAppSettings,
  KrogerModality,
  KrogerStore,
  PriceCheck,
  SendBasketInput,
  ShopStatus,
  StoreProduct,
} from "@mise/shared"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "@/lib/api"

const SHOP_KEY = ["shop"] as const
const STATUS_KEY = [...SHOP_KEY, "status"] as const
const APP_KEY = [...SHOP_KEY, "kroger-app"] as const
export const BASKET_KEY = [...SHOP_KEY, "basket", "kroger"] as const
const DEALS_KEY = [...SHOP_KEY, "deals"] as const

/** The household's store connections. */
export function useShopStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => (await api<{ status: ShopStatus }>("/shop")).status,
    staleTime: 60_000,
  })
}

/** Server admin: the server's Kroger app. */
export function useKrogerApp(enabled: boolean) {
  return useQuery({
    queryKey: APP_KEY,
    queryFn: async () =>
      (await api<{ app: KrogerAppSettings }>("/shop/kroger/app")).app,
    enabled,
  })
}

export function useSaveKrogerApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientId: string | null
      clientSecret?: string | null
    }) =>
      (
        await api<{ app: KrogerAppSettings }>("/shop/kroger/app", {
          method: "PUT",
          body: input,
        })
      ).app,
    onSuccess: (app) => {
      queryClient.setQueryData(APP_KEY, app)
      queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
  })
}

/** Kroger-family stores near a ZIP code. */
export function useKrogerStores(zip: string) {
  return useQuery({
    queryKey: [...SHOP_KEY, "stores", zip],
    queryFn: async () =>
      (
        await api<{ stores: KrogerStore[] }>(
          `/shop/kroger/locations?zip=${encodeURIComponent(zip)}`
        )
      ).stores,
    enabled: /^\d{5}$/.test(zip),
    staleTime: 10 * 60_000,
  })
}

export function useSaveKrogerSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      locationId?: string
      modality?: KrogerModality
    }) =>
      (
        await api<{ status: ShopStatus }>("/shop/kroger", {
          method: "PUT",
          body: input,
        })
      ).status,
    onSuccess: (status) => {
      queryClient.setQueryData(STATUS_KEY, status)
      queryClient.removeQueries({ queryKey: BASKET_KEY })
    },
  })
}

/** Sends the person to Kroger's sign-in; Kroger brings them back to Settings. */
export function useLinkKroger() {
  return useMutation({
    mutationFn: async () =>
      (await api<{ url: string }>("/shop/kroger/link", { body: {} })).url,
    onSuccess: (url) => window.location.assign(url),
  })
}

export function useUnlinkKroger() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (
        await api<{ status: ShopStatus }>("/shop/kroger/link", {
          method: "DELETE",
        })
      ).status,
    onSuccess: (status) => queryClient.setQueryData(STATUS_KEY, status),
  })
}

/** The list matched to Fry's products. Building it the first time searches for each item. */
export function useBasket(enabled: boolean) {
  return useQuery({
    queryKey: BASKET_KEY,
    queryFn: async () =>
      (await api<{ basket: Basket }>("/shop/kroger/basket")).basket,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useStoreSearch(query: string) {
  return useQuery({
    queryKey: [...SHOP_KEY, "search", query],
    queryFn: async () =>
      (
        await api<{ products: StoreProduct[] }>(
          `/shop/kroger/search?q=${encodeURIComponent(query)}`
        )
      ).products,
    enabled: query.trim().length >= 3,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })
}

export function usePickProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { itemId: string; productId: string }) =>
      (
        await api<{ line: BasketLine }>(
          `/shop/kroger/products/${input.itemId}`,
          { method: "PUT", body: { productId: input.productId } }
        )
      ).line,
    onSuccess: (line) => {
      queryClient.setQueryData<Basket>(BASKET_KEY, (basket) =>
        basket
          ? {
              ...basket,
              lines: basket.lines.map((current) =>
                current.itemId === line.itemId ? line : current
              ),
            }
          : basket
      )
    },
  })
}

export function useSendBasket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendBasketInput) =>
      api<{ sent: number; storeName: string; cartUrl: string }>(
        "/shop/kroger/send",
        { body: input }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BASKET_KEY })
      queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
  })
}

/** This week's sales at the household's Fry's, and the recipes they're in. */
export function useDeals(enabled = true) {
  return useQuery({
    queryKey: DEALS_KEY,
    queryFn: async () => (await api<{ deals: Deals }>("/shop/deals")).deals,
    staleTime: 5 * 60_000,
    enabled,
  })
}

/** Checks today's prices and sales now, rather than waiting for the morning. */
export function useCheckPrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (
        await api<{ check: PriceCheck }>("/shop/kroger/prices", {
          method: "POST",
        })
      ).check,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOP_KEY })
      queryClient.invalidateQueries({ queryKey: ["list", "prices"] })
    },
  })
}
