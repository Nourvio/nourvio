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
  serverVoice = false,
  onCommand,
  onDenied,
}: {
  enabled: boolean
  /** The server reads aloud (Kokoro or OpenAI) instead of the device's voice. */
  serverVoice?: boolean
  onCommand: (command: CookCommand) => void
  /** The microphone was refused. */
  onDenied: () => void
}) {
  const [listening, setListening] = React.useState(false)
  const [heard, setHeard] = React.useState<string | null>(null)
  const recognition = React.useRef<Recognition | null>(null)
  const speaking = React.useRef(false)
  const enabledRef = React.useRef(enabled)
  const serverRef = React.useRef(serverVoice)
  const handlers = React.useRef({ onCommand, onDenied })
  React.useEffect(() => {
    enabledRef.current = enabled
    serverRef.current = serverVoice
    handlers.current = { onCommand, onDenied }
  })

  // The server's voice plays through one AudioContext, which the tap that
  // turns hands-free on unlocks, so later steps can play by themselves
  // (phones only allow sound that a tap started).
  const audio = React.useRef<AudioContext | null>(null)
  const playing = React.useRef<AudioBufferSourceNode | null>(null)
  const clips = React.useRef(new Map<string, Promise<AudioBuffer>>())
  /** Each thing said takes a turn; a newer one cancels the older. */
  const turn = React.useRef(0)
  React.useEffect(
    () => () => {
      void audio.current?.close().catch(() => {})
    },
    []
  )

  const context = React.useCallback(() => {
    if (!audio.current) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      audio.current = new Context()
    }
    return audio.current
  }, [])

  /** The server's reading of some text, fetched once a visit. */
  const clip = React.useCallback(
    (spoken: string) => {
      let found = clips.current.get(spoken)
      if (!found) {
        found = fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ text: spoken }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`The server voice said ${res.status}`)
            return res.arrayBuffer()
          })
          .then((data) => context().decodeAudioData(data))
        found.catch(() => clips.current.delete(spoken))
        clips.current.set(spoken, found)
      }
      return found
    },
    [context]
  )

  const stopClip = React.useCallback(() => {
    try {
      playing.current?.stop()
    } catch {
      // Not started, or done.
    }
    playing.current = null
  }, [])

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
      try {
        playing.current?.stop()
      } catch {
        // Not playing.
      }
      setListening(false)
      setHeard(null)
    }
  }, [enabled, listen])

  /**
   * Reads text aloud, pausing listening meanwhile: in the server's voice
   * when there is one (the device's voice fills in if it fails or takes too
   * long), else the device's.
   */
  const speak = React.useCallback(
    (text: string) => {
      if (!text.trim()) return
      const spoken = forSpeech(text)
      const mine = ++turn.current
      window.speechSynthesis?.cancel()
      stopClip()
      speaking.current = true
      try {
        recognition.current?.abort()
      } catch {
        // Not listening.
      }

      let done = false
      let fallback: ReturnType<typeof setTimeout> | undefined
      const finished = () => {
        if (done) return
        done = true
        clearTimeout(fallback)
        // Something newer is being said; it carries on from here.
        if (turn.current !== mine) return
        speaking.current = false
        if (enabledRef.current) listen()
      }
      // Some browsers never say they've finished (no voices installed, say):
      // listen again after about as long as it takes to read.
      const listenAfter = (ms: number) => {
        clearTimeout(fallback)
        fallback = setTimeout(finished, ms)
      }
      const onDevice = () => {
        if (done || turn.current !== mine) return
        if (!("speechSynthesis" in window)) return finished()
        listenAfter(Math.min(60_000, 1500 + spoken.length * 90))
        const utterance = new SpeechSynthesisUtterance(spoken)
        // The voice chosen on this device, or the best one it has.
        const voice = chosenVoice()
        if (voice) utterance.voice = voice
        utterance.lang = voice?.lang ?? readingLanguage()
        utterance.onend = finished
        utterance.onerror = finished
        window.speechSynthesis.speak(utterance)
      }

      if (!serverRef.current) return onDevice()
      const sound = context()
      // While this may still be the tap that asked, so phones allow it.
      if (sound.state === "suspended") void sound.resume().catch(() => {})
      const tooSlow = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("The server voice took too long")),
          20_000
        )
      )
      Promise.race([clip(spoken), tooSlow])
        .then((buffer) => {
          if (done || turn.current !== mine) return
          const source = sound.createBufferSource()
          source.buffer = buffer
          source.connect(sound.destination)
          source.onended = finished
          playing.current = source
          listenAfter(buffer.duration * 1000 + 1500)
          source.start()
        })
        .catch(onDevice)
    },
    [listen, clip, context, stopClip]
  )

  /** Gets the server's reading of some text ready, so it plays straight away when wanted. */
  const prepare = React.useCallback(
    (text: string) => {
      if (serverRef.current && text.trim()) {
        clip(forSpeech(text)).catch(() => {})
      }
    },
    [clip]
  )

  const stopSpeaking = React.useCallback(() => {
    turn.current++
    stopClip()
    window.speechSynthesis?.cancel()
  }, [stopClip])

  return { listening, heard, speak, prepare, stopSpeaking }
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
