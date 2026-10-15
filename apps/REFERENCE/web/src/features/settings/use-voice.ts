import type {
  PreviewVoiceInput,
  UpdateVoiceSettingsInput,
  VoiceSettings,
} from "@mise/shared"
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

// Previews already fetched this visit, so playing one again is instant.
const previews = new Map<string, Promise<string>>()

/** A sample of a voice (Kokoro or OpenAI) to play, before it's picked. */
export function previewVoice(input: PreviewVoiceInput) {
  const key = JSON.stringify(input)
  let found = previews.get(key)
  if (!found) {
    found = fetch("/api/voice/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    }).then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? "Couldn't play that voice")
      }
      return URL.createObjectURL(await res.blob())
    })
    found.catch(() => previews.delete(key))
    previews.set(key, found)
  }
  return found
}
