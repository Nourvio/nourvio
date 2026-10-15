import type {
  CleanupJob,
  CleanupSection,
  Proposal,
  Recipe,
  RecipeSection,
} from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { LIST_KEY } from "@/features/list/use-list"
import { PLAN_KEY } from "@/features/plan/use-plan"
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
    if (proposal.recipe) {
      queryClient.setQueryData(proposalKey(proposal.recipe.id), null)
    }
    queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY })
    queryClient.invalidateQueries({ queryKey: JOB_KEY })
    if (proposal.status === "applied" && proposal.kind === "plan_meals") {
      queryClient.invalidateQueries({ queryKey: PLAN_KEY })
    }
    if (proposal.status === "applied" && proposal.kind === "list_items") {
      queryClient.invalidateQueries({ queryKey: LIST_KEY })
    }
    if (proposal.status === "applied" && proposal.kind === "tastes") {
      queryClient.invalidateQueries({ queryKey: ["household-info"] })
    }
    if (proposal.status === "applied" && proposal.kind === "import_link") {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
    }
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

/**
 * Applies a proposal: the chosen sections of a change (to the recipe, or as
 * a new recipe with `asNew`), a new recipe as a whole, or meals or items to
 * add (with no recipe back).
 */
export function useApplyProposal() {
  const resolved = useResolved()
  return useMutation({
    mutationFn: ({
      proposal,
      sections,
      asNew,
    }: {
      proposal: Proposal
      sections?: RecipeSection[]
      asNew?: boolean
    }) =>
      api<{ recipe: Recipe | null; proposal: Proposal }>(
        `/proposals/${proposal.id}/apply`,
        { body: { sections, asNew } }
      ),
    onSuccess: ({ recipe, proposal }) =>
      resolved(proposal, recipe ?? undefined),
  })
}

export function useDismissProposal() {
  const resolved = useResolved()
  return useMutation({
    mutationFn: async (proposal: Proposal) =>
      (
        await api<{ proposal: Proposal }>(`/proposals/${proposal.id}/dismiss`, {
          method: "POST",
        })
      ).proposal,
    onSuccess: (proposal) => resolved(proposal),
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
