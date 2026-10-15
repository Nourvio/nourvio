import * as React from "react"
import { goodVoices, type VoiceStatus } from "@mise/shared"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"

const VOICE_KEY = "mise.cookVoice"
const listeners = new Set<() => void>()

/** The voice chosen on this device: a voice's id, or "auto" for the best one. */
function readChoice() {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "auto"
  } catch {
    return "auto"
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The voice choice, remembered on this device. */
export function useVoiceChoice() {
  const choice = React.useSyncExternalStore(subscribe, readChoice, () => "auto")
  const setChoice = React.useCallback((next: string) => {
    try {
      localStorage.setItem(VOICE_KEY, next)
    } catch {
      // Private windows can refuse; it just won't be remembered.
    }
    for (const listener of listeners) listener()
  }, [])
  return [choice, setChoice] as const
}

/** The device's voices, which some browsers only list a moment after loading. */
export function useVoices() {
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>(() =>
    "speechSynthesis" in window ? window.speechSynthesis.getVoices() : []
  )
  React.useEffect(() => {
    if (!("speechSynthesis" in window)) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener("voiceschanged", update)
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])
  return voices
}

/** The language steps are read in. */
export function readingLanguage() {
  return navigator.language || "en-US"
}

/** The voice to read with right now: the one chosen, else the best there is. */
export function chosenVoice(
  voices: SpeechSynthesisVoice[] = "speechSynthesis" in window
    ? window.speechSynthesis.getVoices()
    : [],
  choice = readChoice()
) {
  const picked =
    choice === "auto" ? undefined : voices.find((v) => v.voiceURI === choice)
  return picked ?? goodVoices(voices, readingLanguage(), 1)[0] ?? null
}

/** A sentence in the chosen voice, to hear what it sounds like. */
export function testVoice(choice?: string) {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(
    "Preheat the oven to 425 degrees, and season the chicken while it heats."
  )
  const voice = chosenVoice(undefined, choice)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? readingLanguage()
  window.speechSynthesis.speak(utterance)
}

export const VOICE_KEY_QUERY = ["voice"] as const

/** Whether the server reads aloud (Kokoro or OpenAI), rather than the device. */
export function useServerVoice() {
  return useQuery({
    queryKey: VOICE_KEY_QUERY,
    queryFn: async () => (await api<{ status: VoiceStatus }>("/voice")).status,
    staleTime: 5 * 60_000,
  })
}
