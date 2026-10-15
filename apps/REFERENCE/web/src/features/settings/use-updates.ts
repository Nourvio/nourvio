import type { UpdateStatus } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useCurrentUser } from "@/features/auth/current-user"
import { api } from "@/lib/api"

const UPDATES_KEY = ["updates"] as const

/** Whether a newer Nourvio is on GitHub. Only the server admin asks: they're who updates it. */
export function useUpdates() {
  const me = useCurrentUser()
  return useQuery({
    queryKey: UPDATES_KEY,
    queryFn: async () =>
      (await api<{ status: UpdateStatus }>("/updates")).status,
    enabled: me.isServerAdmin,
    staleTime: 60 * 60_000,
  })
}

/** Whether to show the "Update" badge. */
export function useUpdateAvailable() {
  return useUpdates().data?.state === "available"
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (
        await api<{ status: UpdateStatus }>("/updates/check", {
          method: "POST",
        })
      ).status,
    onSuccess: (status) => queryClient.setQueryData(UPDATES_KEY, status),
  })
}
