import type { CleanupJob, CleanupSection, Proposal, Recipe } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

import { RECIPES_KEY } from "./use-recipes"

const PROPOSALS_KEY = ["proposals"] as const
const proposalKey = (recipeId: string) => ["proposal", recipeId] as const
const JOB_KEY = ["ai", "cleanup-job"] as const

/** Suggestions waiting for review across the library. */
export function usePendingProposals() {
  return useQuery({
    queryKey: PROPOSALS_KEY,
    queryFn: async () =>
      (await api<{ proposals: Proposal[] }>("/proposals")).proposals,
  })
}

/** The suggestions waiting on one recipe, if any. */
export function useRecipeProposal(recipeId: string) {
  return useQuery({
    queryKey: proposalKey(recipeId),
    queryFn: async () =>
      (
        await api<{ proposal: Proposal | null }>(
          `/recipes/${recipeId}/proposal`
        )
      ).proposal,
  })
}

export function useTidyUp(recipeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sections: CleanupSection[]) =>
      (
        await api<{ proposal: Proposal | null }>(
          `/recipes/${recipeId}/cleanup`,
          { body: { sections } }
        )
      ).proposal,
    onSuccess: (proposal) => {
      queryClient.setQueryData(proposalKey(recipeId), proposal)
      queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY })
    },
  })
}

/** After applying or dismissing: forget the proposal and refresh what changed. */
function useResolved() {
  const queryClient = useQueryClient()
  return (proposal: Proposal, recipe?: Recipe) => {
    queryClient.setQueryData(proposalKey(proposal.recipe.id), null)
    queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY })
    queryClient.invalidateQueries({ queryKey: JOB_KEY })
    if (recipe) {
      queryClient.setQueryData(["recipe", recipe.slug], recipe)
      queryClient.setQueryData(["recipe", recipe.id], recipe)
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      queryClient.invalidateQueries({
        queryKey: ["recipe-versions", recipe.id],
      })
    }
  }
}

export function useApplyProposal() {
  const resolved = useResolved()
  return useMutation({
    mutationFn: async ({
      proposal,
      sections,
    }: {
      proposal: Proposal
      sections: CleanupSection[]
    }) =>
      (
        await api<{ recipe: Recipe }>(`/proposals/${proposal.id}/apply`, {
          body: { sections },
        })
      ).recipe,
    onSuccess: (recipe, { proposal }) => resolved(proposal, recipe),
  })
}

export function useDismissProposal() {
  const resolved = useResolved()
  return useMutation({
    mutationFn: (proposal: Proposal) =>
      api(`/proposals/${proposal.id}/dismiss`, { method: "POST" }),
    onSuccess: (_, proposal) => resolved(proposal),
  })
}

/** The household's latest library run and how many recipes are still untidied. Household admins. */
export function useCleanupJob(enabled: boolean) {
  return useQuery({
    queryKey: JOB_KEY,
    queryFn: () =>
      api<{ job: CleanupJob | null; untidied: number }>("/ai/cleanup-job"),
    enabled,
    // Check on a running job every few seconds.
    refetchInterval: (query) =>
      query.state.data?.job?.status === "running" ? 3000 : false,
  })
}

export function useStartCleanupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ job: CleanupJob }>("/ai/cleanup-job", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOB_KEY }),
  })
}

export function useCancelCleanupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<{ job: CleanupJob }>(`/ai/cleanup-job/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOB_KEY }),
  })
}
