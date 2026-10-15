import type { UpdateVoiceSettingsInput, VoiceSettings } from "@mise/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

const VOICE_SETTINGS_KEY = ["voice", "settings"] as const

/** Server admin: how cook mode reads aloud, and what Kokoro offers. */
export function useVoiceSettings() {
  return useQuery({
    queryKey: VOICE_SETTINGS_KEY,
    queryFn: async () =>
      (await api<{ settings: VoiceSettings }>("/voice/settings")).settings,
  })
}

export function useSaveVoiceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateVoiceSettingsInput) =>
      (
        await api<{ settings: VoiceSettings }>("/voice/settings", {
          method: "PUT",
          body: input,
        })
      ).settings,
    onSuccess: (settings) => {
      queryClient.setQueryData(VOICE_SETTINGS_KEY, settings)
      // Cook mode's "does the server read aloud?"
      queryClient.invalidateQueries({ queryKey: ["voice"], exact: true })
    },
  })
}

/** Plays a sentence in the server's voice, as cook mode would hear it. */
export async function playServerVoice(text: string) {
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? "The server voice couldn't read that")
  }
  const url = URL.createObjectURL(await res.blob())
  const audio = new Audio(url)
  audio.onended = () => URL.revokeObjectURL(url)
  await audio.play()
}
