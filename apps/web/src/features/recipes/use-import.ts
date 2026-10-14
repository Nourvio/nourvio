import type { ImportResult } from "@mise/shared"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"

import { api } from "@/lib/api"

import { RECIPES_KEY } from "./use-recipes"

export type ImportTab = "link" | "text" | "photo"

const IMPORT_TABS: ImportTab[] = ["link", "text", "photo"]

/** Params the import dialog owns, including the ones a share sheet sends. */
const IMPORT_PARAMS = ["import", "url", "text", "title"]

/** The first web link in some shared text ("Check this out! https://vm.tiktok.com/…"). */
export function findLink(text: string | null) {
  return text?.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? ""
}

/**
 * The import dialog lives in the URL (`?import=link`), so any button can open
 * it and the installed app can receive links from the phone's share sheet
 * (`?url=…` or `?text=…`, see manifest.webmanifest).
 */
export function useImportDialog() {
  const [params, setParams] = useSearchParams()
  const sharedLink = params.get("url") || findLink(params.get("text"))
  const requested = params.get("import") as ImportTab | null
  const tab: ImportTab | null =
    requested && IMPORT_TABS.includes(requested)
      ? requested
      : sharedLink
        ? "link"
        : null

  function open(next: ImportTab) {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      updated.set("import", next)
      return updated
    })
  }

  function close() {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        for (const key of IMPORT_PARAMS) updated.delete(key)
        return updated
      },
      { replace: true }
    )
  }

  return { tab, sharedLink, open, close }
}

export function useImportUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { url: string; force?: boolean }) =>
      api<ImportResult>("/import/url", { body: input }),
    onSuccess: (result) => {
      queryClient.setQueryData(["recipe", result.recipe.slug], result.recipe)
      if (!result.duplicate) {
        queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      }
    },
  })
}
