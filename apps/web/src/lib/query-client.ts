import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { ApiError } from "./api"

/** A 401 anywhere means the session ended: mark the user signed out, and RequireAuth sends them to sign in. */
function onError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(["session"], null)
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 1,
    },
  },
})
