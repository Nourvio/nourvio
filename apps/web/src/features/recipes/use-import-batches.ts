import * as React from "react"
import {
  findLinks,
  type ImportBatch,
  type ImportBatchInput,
  type ImportBatchSummary,
  type LinkPreview,
} from "@mise/shared"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "@/lib/api"

import { RECIPES_KEY } from "./use-recipes"

export const IMPORT_BATCH_KEY = ["import-batch"] as const

/** A slow check as well, in case the live stream drops. */
const CHECK_MS = 10_000

const whileRunning = (
  batch: { finishedAt: string | null } | null | undefined
) => (batch && !batch.finishedAt ? CHECK_MS : false)

/**
 * Follows bulk imports while one is running: each link that starts or
 * finishes refreshes the import, and the library a moment later.
 */
function useImportEvents(enabled: boolean) {
  const queryClient = useQueryClient()
  React.useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return
    const source = new EventSource("/api/events")
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: IMPORT_BATCH_KEY })
      clearTimeout(timer)
      timer = setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
        1500
      )
    }
    source.addEventListener("imports", refresh)
    // Back after the connection dropped: catch up.
    let opened = false
    source.addEventListener("open", () => {
      if (opened) refresh()
      opened = true
    })
    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [enabled, queryClient])
}

/** One bulk import, kept up to date while it runs. */
export function useImportBatch(id: string) {
  const query = useQuery({
    queryKey: [...IMPORT_BATCH_KEY, id],
    queryFn: () =>
      api<{ batch: ImportBatch }>(`/import/batch/${id}`).then(
        (res) => res.batch
      ),
    refetchInterval: (query) => whileRunning(query.state.data),
  })
  useImportEvents(Boolean(query.data && !query.data.finishedAt))
  return query
}

/**
 * The household's latest bulk import from today, for the chip on Recipes.
 * Listens the whole time, so one started elsewhere (a share, someone else
 * in the household) shows up too.
 */
export function useCurrentImport() {
  const query = useQuery({
    queryKey: [...IMPORT_BATCH_KEY, "current"],
    queryFn: () =>
      api<{ batch: ImportBatchSummary | null }>("/import/batch/current").then(
        (res) => res.batch
      ),
    refetchInterval: (query) => whileRunning(query.state.data),
  })
  useImportEvents(true)
  return query
}

/** The links in some pasted text, worked out a moment after typing stops. */
export function useLinkPreview(text: string) {
  const [settled, setSettled] = React.useState(text)
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(text), 350)
    return () => clearTimeout(timer)
  }, [text])
  const hasLinks = findLinks(settled).length > 0
  return useQuery({
    queryKey: ["import-links", settled],
    queryFn: () =>
      api<{ links: LinkPreview[]; more: number }>("/import/links", {
        body: { text: settled },
      }),
    enabled: hasLinks,
    placeholderData: keepPreviousData,
    select: (data) => (hasLinks ? data : { links: [], more: 0 }),
  })
}

export function useStartImportBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ImportBatchInput) =>
      api<{ batch: ImportBatch }>("/import/batch", { body: input }),
    onSuccess: ({ batch }) => {
      queryClient.setQueryData([...IMPORT_BATCH_KEY, batch.id], batch)
      void queryClient.invalidateQueries({
        queryKey: [...IMPORT_BATCH_KEY, "current"],
      })
    },
  })
}

/** Stop what's waiting, or try again: all that didn't work, or one link. */
export function useImportBatchAction(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      action: { type: "stop" } | { type: "retry"; itemId?: string }
    ) =>
      api<{ batch: ImportBatch }>(
        action.type === "stop"
          ? `/import/batch/${id}/stop`
          : action.itemId
            ? `/import/batch/${id}/items/${action.itemId}/retry`
            : `/import/batch/${id}/retry`,
        { method: "POST" }
      ),
    onSuccess: ({ batch }) => {
      queryClient.setQueryData([...IMPORT_BATCH_KEY, id], batch)
      void queryClient.invalidateQueries({
        queryKey: [...IMPORT_BATCH_KEY, "current"],
      })
    },
  })
}
