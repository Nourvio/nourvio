import type { InvitePreview, JoinInput, SignupInput, User } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

import { SESSION_KEY } from "./use-session"

/** Who's inviting, before joining. Errors say whether the link is used or expired. */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: async () =>
      (await api<{ invite: InvitePreview }>(`/join/${token}`)).invite,
    retry: false,
  })
}

export function useJoin(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: JoinInput) =>
      api<{ user: User }>(`/join/${token}`, { body: input }),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SignupInput) =>
      api<{ user: User }>("/signup", { body: input }),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  })
}
