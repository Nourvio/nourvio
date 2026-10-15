import type { ChatConversation } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

export const CHAT_KEY = ["chat"] as const

/** The signed-in person's conversations, newest first. */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: [...CHAT_KEY, "conversations"],
    queryFn: async () =>
      (await api<{ conversations: ChatConversation[] }>("/chat/conversations"))
        .conversations,
    enabled,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/chat/conversations/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAT_KEY }),
  })
}
