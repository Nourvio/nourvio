import type {
  CleanupJob,
  NutritionLibrary,
  NutritionSettings,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

import { AI_KEY } from "./use-ai"

const NUTRITION_KEY = ["nutrition-settings"] as const

/** Server admin: the USDA key. */
export function useNutritionSettings() {
  return useQuery({
    queryKey: NUTRITION_KEY,
    queryFn: async () =>
      (await api<{ settings: NutritionSettings }>("/nutrition/settings"))
        .settings,
  })
}

export function useSaveUsdaKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (usdaKey: string | null) =>
      (
        await api<{ settings: NutritionSettings }>("/nutrition/settings", {
          method: "PUT",
          body: { usdaKey },
        })
      ).settings,
    onSuccess: (settings) => {
      queryClient.setQueryData(NUTRITION_KEY, settings)
      // Recipe pages check this to offer "Work out nutrition".
      queryClient.invalidateQueries({ queryKey: AI_KEY })
    },
  })
}

/** Tries a key (given, or the saved one) with a small USDA search. */
export function useTestUsdaKey() {
  return useMutation({
    mutationFn: (usdaKey?: string) =>
      api<{ ok: true; found: number }>("/nutrition/settings/test", {
        body: usdaKey ? { usdaKey } : {},
      }),
  })
}

const LIBRARY_KEY = ["nutrition-library"] as const

/** Household admins: the library run, and how many recipes still need nutrition. */
export function useNutritionLibrary() {
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: () => api<NutritionLibrary>("/nutrition/library"),
    // Check on a running job every few seconds.
    refetchInterval: (query) =>
      query.state.data?.job?.status === "running" ? 3000 : false,
  })
}

export function useStartNutritionLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ job: CleanupJob }>("/nutrition/library", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }),
  })
}

export function useStopNutritionLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<{ job: CleanupJob }>(`/nutrition/library/${id}/stop`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }),
  })
}
