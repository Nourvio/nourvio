import type { CreateUserInput, UpdateUserInput, User } from "@mise/shared"
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
