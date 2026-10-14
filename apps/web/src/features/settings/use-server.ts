import type { HouseholdSummary, ServerSettings } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

const SERVER_SETTINGS_KEY = ["server", "settings"] as const
const HOUSEHOLDS_KEY = ["server", "households"] as const

/** Server-wide settings. Server admin only. */
export function useServerSettings() {
  return useQuery({
    queryKey: SERVER_SETTINGS_KEY,
    queryFn: () => api<ServerSettings>("/server/settings"),
  })
}

export function useUpdateServerSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ServerSettings>) =>
      api<ServerSettings>("/server/settings", { method: "PUT", body: input }),
    onSuccess: (settings) => {
      queryClient.setQueryData(SERVER_SETTINGS_KEY, settings)
      queryClient.invalidateQueries({ queryKey: ["setup-status"] })
    },
  })
}

/** Every household on the server. Server admin only. */
export function useHouseholds() {
  return useQuery({
    queryKey: HOUSEHOLDS_KEY,
    queryFn: async () =>
      (await api<{ households: HouseholdSummary[] }>("/server/households"))
        .households,
  })
}

export function useDeleteHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/server/households/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: HOUSEHOLDS_KEY }),
  })
}
