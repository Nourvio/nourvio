import type { ExtensionToken } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

const TOKENS_KEY = ["extension", "tokens"] as const

/** The browsers the extension is connected in. */
export function useExtensionTokens() {
  return useQuery({
    queryKey: TOKENS_KEY,
    queryFn: async () =>
      (await api<{ tokens: ExtensionToken[] }>("/extension/tokens")).tokens,
  })
}

export function useCreateExtensionToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api<{ token: string; info: ExtensionToken }>("/extension/tokens", {
        body: { name },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  })
}

export function useRevokeExtensionToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/extension/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  })
}

/** "Chrome on Windows", from the browser's own description of itself. */
export function browserName() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : "A browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "a Mac"
      : /CrOS/.test(ua)
        ? "a Chromebook"
        : /Linux/.test(ua)
          ? "Linux"
          : null
  return os ? `${browser} on ${os}` : browser
}
