import * as React from "react"
import { parseCookCommand, type CookCommand } from "@mise/shared"

import { chosenVoice, readingLanguage } from "./voices"

// The Web Speech API isn't in TypeScript's DOM types everywhere, so just
// what's used here.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  abort(): void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null
  const speech = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null
}

/** Whether this browser can listen and speak (Chrome, Edge and Safari can; Firefox can't listen). */
export function handsFreeSupported() {
  return Boolean(recognitionClass()) && "speechSynthesis" in window
}

/**
 * Listens for cooking commands while on, and reads things aloud. Listening
 * pauses while it speaks, so it doesn't hear itself, and restarts whenever
 * the browser stops it (after a silence, say).
 */
export function useHandsFree({
  enabled,
  onCommand,
  onDenied,
}: {
  enabled: boolean
  onCommand: (command: CookCommand) => void
  /** The microphone was refused. */
  onDenied: () => void
}) {
  const [listening, setListening] = React.useState(false)
  const [heard, setHeard] = React.useState<string | null>(null)
  const recognition = React.useRef<Recognition | null>(null)
  const speaking = React.useRef(false)
  const enabledRef = React.useRef(enabled)
  const handlers = React.useRef({ onCommand, onDenied })
  React.useEffect(() => {
    enabledRef.current = enabled
    handlers.current = { onCommand, onDenied }
  })

  const listen = React.useCallback(() => {
    try {
      recognition.current?.start()
    } catch {
      // Already listening.
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    const Recognizer = recognitionClass()
    if (!Recognizer) return
    const recognizer = new Recognizer()
    recognizer.continuous = true
    recognizer.interimResults = false
    recognizer.lang = navigator.language || "en-US"
    recognizer.onresult = (event) => {
      const result = event.results[event.results.length - 1]
      if (!result?.isFinal) return
      const said = result[0].transcript.trim()
      setHeard(said)
      const command = parseCookCommand(said)
      if (command) handlers.current.onCommand(command)
    }
    recognizer.onstart = () => setListening(true)
    recognizer.onend = () => {
      setListening(false)
      // Browsers stop listening after a while; carry on unless speaking.
      if (
        enabledRef.current &&
        !speaking.current &&
        recognition.current === recognizer
      ) {
        listen()
      }
    }
    recognizer.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        handlers.current.onDenied()
      }
    }
    recognition.current = recognizer
    if (!speaking.current) listen()
    return () => {
      recognition.current = null
      recognizer.onend = null
      try {
        recognizer.abort()
      } catch {
        // Already stopped.
      }
      window.speechSynthesis?.cancel()
      setListening(false)
      setHeard(null)
    }
  }, [enabled, listen])

  /** Reads text aloud, pausing listening meanwhile. */
  const speak = React.useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window) || !text.trim()) return
      window.speechSynthesis.cancel()
      speaking.current = true
      try {
        recognition.current?.abort()
      } catch {
        // Not listening.
      }
      const utterance = new SpeechSynthesisUtterance(forSpeech(text))
      // The voice chosen on this device, or the best one it has.
      const voice = chosenVoice()
      if (voice) utterance.voice = voice
      utterance.lang = voice?.lang ?? readingLanguage()
      let done = false
      const finished = () => {
        if (done) return
        done = true
        clearTimeout(fallback)
        speaking.current = false
        if (enabledRef.current) listen()
      }
      // Some browsers never say they've finished (no voices installed, say):
      // listen again after about as long as it would take to read.
      const fallback = setTimeout(
        finished,
        Math.min(60_000, 1500 + text.length * 90)
      )
      utterance.onend = finished
      utterance.onerror = finished
      window.speechSynthesis.speak(utterance)
    },
    [listen]
  )

  const stopSpeaking = React.useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { listening, heard, speak, stopSpeaking }
}

const SPOKEN_UNITS: [RegExp, string][] = [
  [/(\d) ½/g, "$1 and a half"],
  [/(^|[\s(])½ /g, "$1half a "],
  [/(^|[\s(])¼ /g, "$1a quarter "],
  [/(^|[\s(])⅓ /g, "$1a third of a "],
  [/¾/g, "three quarters"],
  [/⅔/g, "two thirds"],
  // One of something, or a fraction of one, is singular.
  [/\b(1|a) tbsps?\b/gi, "$1 tablespoon"],
  [/\b(1|a) tsps?\b/gi, "$1 teaspoon"],
  [/\b(1|a) lbs?\b/gi, "$1 pound"],
  [/\b(1|a) oz\b/gi, "$1 ounce"],
  [/\btbsps?\b/gi, "tablespoons"],
  [/\btsps?\b/gi, "teaspoons"],
  [/\blbs?\b/gi, "pounds"],
  [/\boz\b/gi, "ounces"],
  [/\bkg\b/gi, "kilograms"],
  [/\bml\b/gi, "milliliters"],
  [/(\d) ?g\b/g, "$1 grams"],
]

/** "1 ½ tbsp", "28 g" → "1 and a half tablespoons", "28 grams": easier to follow out loud. */
export function forSpeech(text: string) {
  return SPOKEN_UNITS.reduce(
    (spoken, [pattern, words]) => spoken.replace(pattern, words),
    text
  )
}

/** 600 → "10 minutes", 90 → "90 seconds", for saying out loud. */
export function spokenDuration(seconds: number) {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return `${hours} ${hours === 1 ? "hour" : "hours"}`
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  }
  return `${seconds} seconds`
}
