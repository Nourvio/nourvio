import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ShoppingList = Schemas["ShoppingList"]
export type ListItem = Schemas["ListItem"]
export type ListItemSnapshot = Schemas["ListItemSnapshot"]
export type Aisle = ShoppingList["aisles"][number]
export type EveryWeekItem = Schemas["EveryWeekItem"]

/** The list, its aisles and its items by aisle. */
export const listQuery = queryOptions({
  queryKey: ["list"],
  queryFn: () => unwrap(api.GET("/api/list")),
})

export const everyWeekQuery = queryOptions({
  queryKey: ["list", "every-week"],
  queryFn: () => unwrap(api.GET("/api/list/every-week")),
})

export const onHandQuery = queryOptions({
  queryKey: ["household", "on-hand"],
  queryFn: () => unwrap(api.GET("/api/households/current/on-hand")),
})

/** The planned meals from one day to another that aren't on the list yet. */
export const fromPlanQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["list", "from-plan", from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/list/from-plan", { params: { query: { from, to } } })
      ),
  })
