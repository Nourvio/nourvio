import type {
  CreatedInvite,
  CreateUserInput,
  Household,
  HouseholdTastes,
  Invite,
  Role,
  UpdateHouseholdInput,
  UpdateUserInput,
  User,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { SESSION_KEY } from "@/features/auth/use-session"
import { api } from "@/lib/api"

const HOUSEHOLD_KEY = ["household"] as const

/** Everyone in the household. Only admins can load this. */
export function useHousehold(enabled: boolean) {
  return useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: async () => (await api<{ users: User[] }>("/users")).users,
    enabled,
  })
}

export function useAddMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api<{ user: User }>("/users", { body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY }),
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) =>
      api<{ user: User }>(`/users/${id}`, { method: "PATCH", body: input }),
    onSuccess: ({ user }) => {
      queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
      // Changed your own role: refresh what the rest of the app knows about you.
      if (queryClient.getQueryData<User>(SESSION_KEY)?.id === user.id) {
        queryClient.setQueryData(SESSION_KEY, user)
      }
    },
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY }),
  })
}

const HOUSEHOLD_INFO_KEY = ["household-info"] as const
const INVITES_KEY = ["invites"] as const

/** The signed-in person's household: name and settings. */
export function useHouseholdInfo() {
  return useQuery({
    queryKey: HOUSEHOLD_INFO_KEY,
    queryFn: async () =>
      (await api<{ household: Household }>("/household")).household,
  })
}

export function useUpdateHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateHouseholdInput) =>
      api<{ household: Household }>("/household", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: ({ household }) =>
      queryClient.setQueryData(HOUSEHOLD_INFO_KEY, household),
  })
}

/** The household's tastes and rules. Anyone in the household can change them. */
export function useUpdateTastes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tastes: HouseholdTastes) =>
      api<{ household: Household }>("/household/tastes", {
        method: "PUT",
        body: tastes,
      }),
    onSuccess: ({ household }) =>
      queryClient.setQueryData(HOUSEHOLD_INFO_KEY, household),
  })
}

/** Invite links that still work. Household admins only. */
export function useInvites(enabled: boolean) {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: async () =>
      (await api<{ invites: Invite[] }>("/household/invites")).invites,
    enabled,
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (role: Role) =>
      (
        await api<{ invite: CreatedInvite }>("/household/invites", {
          body: { role },
        })
      ).invite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITES_KEY }),
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/household/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITES_KEY }),
  })
}
