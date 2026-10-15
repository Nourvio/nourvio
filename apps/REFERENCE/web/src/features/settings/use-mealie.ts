import type {
  MealieCheck,
  MealieConnectionInput,
  MealieJob,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { RECIPES_KEY } from "@/features/recipes/use-recipes"
import { api } from "@/lib/api"

const JOB_KEY = ["mealie", "job"] as const

export function useCheckMealie() {
  return useMutation({
    mutationFn: (input: MealieConnectionInput) =>
      api<MealieCheck>("/import/mealie/check", { body: input }),
  })
}

/** The latest Mealie import, polled while it runs. */
export function useMealieJob() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: JOB_KEY,
    queryFn: async () => {
      const { job } = await api<{ job: MealieJob | null }>("/import/mealie/job")
      // New recipes keep arriving while it runs.
      if (job) queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      return job
    },
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  })
}

export function useStartMealieImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MealieConnectionInput) =>
      api<{ job: MealieJob }>("/import/mealie", { body: input }),
    onSuccess: ({ job }) => queryClient.setQueryData(JOB_KEY, job),
  })
}
