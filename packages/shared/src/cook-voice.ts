/** Something said while cooking hands-free, as a command. */
export type CookCommand =
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "repeat" }
  | { kind: "ingredients" }
  | { kind: "timer"; seconds: number; label: string }
  | { kind: "stepTimer" }
  | { kind: "howMuch"; food: string }
  | { kind: "stop" }
  | { kind: "done" }

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
}

/** "10", "ten", "twenty five", "2.5" → a number, or null. */
function readNumber(words: string) {
  const trimmed = words.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  let total = 0
  for (const word of trimmed.split(/[\s-]+/)) {
    const value = NUMBER_WORDS[word]
    if (value === undefined) return null
    total += value
  }
  return total || null
}

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  sec: 1,
  minute: 60,
  min: 60,
  hour: 3600,
}

/** Words people put around a command that don't change it. */
const FILLER =
  /^(?:(?:ok(?:ay)?|hey|so|um+|uh+|please|mise|alright)\s+)+|\s+(?:please|thanks|thank you)$/g

/**
 * Reads what was said while cooking. Whole phrases only ("next", "go back",
 * "timer for 10 minutes", "how much garlic"), so conversation in the
 * kitchen ("what's next for dinner?") doesn't turn the page.
 */
export function parseCookCommand(said: string): CookCommand | null {
  const text = said
    .toLowerCase()
    .replace(/[.,!?;:"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILLER, "")
    .trim()
  if (!text) return null

  if (
    /^(?:next|next step|go on|continue|keep going|go ahead|forward)$/.test(text)
  ) {
    return { kind: "next" }
  }
  if (
    /^(?:back|go back|previous|previous step|last step|step back)$/.test(text)
  ) {
    return { kind: "back" }
  }
  if (
    /^(?:repeat|repeat that|again|say (?:that|it) again|read it|read that|read (?:the )?step|what was that|come again)$/.test(
      text
    )
  ) {
    return { kind: "repeat" }
  }
  if (
    /^(?:ingredients|what do i need|which ingredients|what goes in|read (?:the )?ingredients)$/.test(
      text
    )
  ) {
    return { kind: "ingredients" }
  }
  if (
    /^(?:stop|quiet|be quiet|shh+|hush|stop talking|stop reading)$/.test(text)
  ) {
    return { kind: "stop" }
  }
  if (/^(?:done|i'?m done|finished|all done|done cooking)$/.test(text)) {
    return { kind: "done" }
  }
  if (/^(?:start (?:the )?timer|start it|set (?:the )?timer)$/.test(text)) {
    return { kind: "stepTimer" }
  }

  // "half an hour timer", "set a timer for half an hour"
  if (/\btimer\b/.test(text) && /\bhalf an hour\b/.test(text)) {
    return { kind: "timer", seconds: 1800, label: "30 min" }
  }
  // "set a timer for 10 minutes", "timer 90 seconds", "start a five minute timer"
  const timer = text.match(
    /^(?:set |start )?(?:a |the )?(?:timer (?:for )?)?([\w.\s-]+?) (second|sec|minute|min|hour)s? ?(?:timer)?$/
  )
  if (timer && /\btimer\b/.test(text)) {
    const amount = readNumber(timer[1]!)
    const unit = UNIT_SECONDS[timer[2]!]!
    if (amount && amount > 0 && amount * unit <= 24 * 3600) {
      const short = { 1: "sec", 60: "min", 3600: "hr" }[unit]
      return {
        kind: "timer",
        seconds: Math.round(amount * unit),
        label: `${amount} ${short}`,
      }
    }
  }

  const howMuch = text.match(
    /^how (?:much|many)(?: of(?: the)?| the)? (.+?)(?: (?:do|should|did) i (?:need|use|add|put in))?(?: again)?$/
  )
  if (howMuch?.[1]) return { kind: "howMuch", food: howMuch[1].trim() }

  return null
}

/** What the browser says about one of its voices (SpeechSynthesisVoice). */
export type VoiceInfo = { name: string; lang: string; default: boolean }

/** Words in a voice's name that mark the natural-sounding ones. */
const NATURAL = /\b(natural|neural|premium|enhanced|siri)\b/i
/** Good, if a step behind: Google's, and other voices streamed online. */
const GOOD = /\b(google|online)\b/i
/** Apple's joke and very old voices, never picked by themselves. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|kathy|princess|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)\b/i

const base = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]!

/**
 * How good a voice is for reading in a language: -1 for another language,
 * 0 for a joke voice, then higher for natural ones and an exact match.
 */
export function voiceScore(voice: VoiceInfo, lang: string) {
  if (base(voice.lang) !== base(lang)) return -1
  if (NOVELTY.test(voice.name)) return 0
  let score = 1
  if (voice.lang.toLowerCase().replace("_", "-") === lang.toLowerCase()) {
    score += 2
  }
  if (NATURAL.test(voice.name)) score += 10
  else if (GOOD.test(voice.name)) score += 5
  if (voice.default) score += 1
  return score
}

/** The voices worth choosing from for a language, best first. */
export function goodVoices<T extends VoiceInfo>(
  voices: T[],
  lang: string,
  limit = 8
) {
  return voices
    .map((voice) => ({ voice, score: voiceScore(voice, lang) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name)
    )
    .slice(0, limit)
    .map((entry) => entry.voice)
}

/** "Microsoft Aria Online (Natural) - English (United States)" → "Aria Online (Natural)". */
export function voiceLabel(voice: Pick<VoiceInfo, "name">) {
  return voice.name
    .replace(/\s+-\s+.*$/, "")
    .replace(/^(Microsoft|Google)\s+/, "")
    .trim()
}
