import type { ImportResult } from "@mise/shared"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"

import { api, apiUpload } from "@/lib/api"
import { shrinkImage } from "@/lib/shrink-image"

import { RECIPES_KEY } from "./use-recipes"

/** The dialog's tabs, and "links" for several at once (its own view). */
export type ImportTab = "link" | "text" | "photo" | "links"

const IMPORT_TABS: ImportTab[] = ["link", "text", "photo", "links"]

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

  // The page behind the dialog stays where it was.
  function open(next: ImportTab) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.set("import", next)
        return updated
      },
      { preventScrollReset: true }
    )
  }

  function close() {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        for (const key of IMPORT_PARAMS) updated.delete(key)
        return updated
      },
      { replace: true, preventScrollReset: true }
    )
  }

  return { tab, sharedLink, open, close }
}

/** Keeps the new recipe in the cache and refreshes the library. */
function useImported() {
  const queryClient = useQueryClient()
  return (result: ImportResult) => {
    queryClient.setQueryData(["recipe", result.recipe.slug], result.recipe)
    if (!result.duplicate) {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
    }
  }
}

export function useImportUrl() {
  const onSuccess = useImported()
  return useMutation({
    mutationFn: (input: { url: string; force?: boolean }) =>
      api<ImportResult>("/import/url", { body: input }),
    onSuccess,
  })
}

export function useImportText() {
  const onSuccess = useImported()
  return useMutation({
    mutationFn: (text: string) =>
      api<ImportResult>("/import/text", { body: { text } }),
    onSuccess,
  })
}

export function useImportPhotos() {
  const onSuccess = useImported()
  return useMutation({
    mutationFn: async (photos: File[]) => {
      const form = new FormData()
      for (const photo of await Promise.all(photos.map(shrinkImage))) {
        form.append("photos", photo)
      }
      return apiUpload<ImportResult>("/import/photo", form)
    },
    onSuccess,
  })
}
