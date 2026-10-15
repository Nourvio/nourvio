import type { AddReceiptInput, ReceiptAdded, ReceiptDraft } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, apiUpload } from "@/lib/api"

/** Reads a receipt: photos, screenshots, PDFs, or pasted text. */
export function useReadReceipt() {
  return useMutation({
    mutationFn: async (input: { files: File[] } | { text: string }) => {
      if ("text" in input) {
        return (
          await api<{ draft: ReceiptDraft }>("/receipts", {
            body: { text: input.text },
          })
        ).draft
      }
      const form = new FormData()
      for (const file of input.files) form.append("file", file)
      return (await apiUpload<{ draft: ReceiptDraft }>("/receipts", form)).draft
    },
  })
}

/** A receipt read already (shared from a Shortcut), waiting for its look. */
export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: ["receipts", id],
    queryFn: async () =>
      (await api<{ draft: ReceiptDraft }>(`/receipts/${id}`)).draft,
    enabled: Boolean(id),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useAddReceipt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: AddReceiptInput & { id: string }) =>
      api<ReceiptAdded>(`/receipts/${id}/add`, { body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] })
      void queryClient.invalidateQueries({ queryKey: ["list"] })
    },
  })
}
