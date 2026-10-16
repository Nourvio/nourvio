import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Household = Schemas["Household"]
export type Member = Schemas["Member"]
export type InviteLink = Schemas["InviteLink"]
export type HouseholdRole = Household["role"]

export const householdQuery = queryOptions({
  queryKey: ["household"],
  queryFn: () => unwrap(api.GET("/api/households/current")),
})

export const membersQuery = queryOptions({
  queryKey: ["household", "members"],
  queryFn: () => unwrap(api.GET("/api/households/current/members")),
})

export const invitesQuery = queryOptions({
  queryKey: ["household", "invites"],
  queryFn: () => unwrap(api.GET("/api/households/current/invites")),
})

export function isAdminRole(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin"
}
