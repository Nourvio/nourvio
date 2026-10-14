import type {
  ChangePasswordInput,
  LoginInput,
  SetupInput,
  SetupStatus,
  UpdateMeInput,
  User,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"

export const SESSION_KEY = ["session"] as const
const SETUP_STATUS_KEY = ["setup-status"] as const

/** The signed-in user, `null` when signed out. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return (await api<{ user: User }>("/auth/me")).user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useSetupStatus(enabled = true) {
  return useQuery({
    queryKey: SETUP_STATUS_KEY,
    queryFn: () => api<SetupStatus>("/setup/status"),
    enabled,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: User }>("/auth/login", { body: input }),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  })
}

export function useSetup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetupInput) =>
      api<{ user: User }>("/setup", { body: input }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(SESSION_KEY, user)
      queryClient.setQueryData<SetupStatus>(SETUP_STATUS_KEY, (status) => ({
        needsSetup: false,
        signupOpen: status?.signupOpen ?? false,
      }))
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSettled: () => {
      // Update the session in place (RequireAuth is watching it), then drop
      // everything else that was loaded for the signed-in user.
      queryClient.setQueryData(SESSION_KEY, null)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
      })
    },
  })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMeInput) =>
      api<{ user: User }>("/me", { method: "PATCH", body: input }),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api("/me/password", { body: input }),
  })
}
