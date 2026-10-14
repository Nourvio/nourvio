import type {
  AiModel,
  AiProviderId,
  AiSettings,
  AiStatus,
  AiUsageRow,
  UpdateAiSettingsInput,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

export const AI_KEY = ["ai"] as const

/** Can AI features be used? Everyone can ask. */
export function useAiStatus() {
  return useQuery({
    queryKey: [...AI_KEY, "status"],
    queryFn: () => api<AiStatus>("/ai/status"),
    staleTime: 60_000,
  })
}

export function useAiSettings() {
  return useQuery({
    queryKey: [...AI_KEY, "settings"],
    queryFn: () => api<AiSettings>("/ai/settings"),
  })
}

export function useAiModels(enabled: boolean) {
  return useQuery({
    queryKey: [...AI_KEY, "models"],
    queryFn: async () =>
      (await api<{ models: AiModel[] }>("/ai/settings/models")).models,
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useAiUsage() {
  return useQuery({
    queryKey: [...AI_KEY, "usage"],
    queryFn: async () =>
      (await api<{ usage: AiUsageRow[] }>("/ai/settings/usage")).usage,
  })
}

export function useUpdateAiSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAiSettingsInput) =>
      api<AiSettings>("/ai/settings", { method: "PUT", body: input }),
    onSuccess: (settings, input) => {
      queryClient.setQueryData([...AI_KEY, "settings"], settings)
      queryClient.invalidateQueries({ queryKey: [...AI_KEY, "status"] })
      if (input.keys) {
        queryClient.invalidateQueries({ queryKey: [...AI_KEY, "models"] })
      }
    },
  })
}

export function useTestAiKey() {
  return useMutation({
    mutationFn: (input: { provider: AiProviderId; key?: string }) =>
      api<{ models: number }>("/ai/settings/test", { body: input }),
  })
}
