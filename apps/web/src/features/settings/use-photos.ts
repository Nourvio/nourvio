import type { CleanupJob, PhotoLibrary } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

const LIBRARY_KEY = ["photo-library"] as const

/** Household admins: the library run, and how many recipes have no photo. */
export function usePhotoLibrary() {
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: () => api<PhotoLibrary>("/photos/library"),
    // Check on a running job every few seconds.
    refetchInterval: (query) =>
      query.state.data?.job?.status === "running" ? 3000 : false,
  })
}

export function useStartPhotoLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ job: CleanupJob }>("/photos/library", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }),
  })
}

export function useStopPhotoLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<{ job: CleanupJob }>(`/photos/library/${id}/stop`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }),
  })
}
