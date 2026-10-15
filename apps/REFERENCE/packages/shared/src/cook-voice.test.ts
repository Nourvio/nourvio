import { describe, expect, test } from "vitest"

import {
  goodVoices,
  parseCookCommand,
  voiceLabel,
  voiceScore,
} from "./cook-voice.ts"

describe("parseCookCommand", () => {
  test("reads the short commands, with or without filler", () => {
    expect(parseCookCommand("Next")).toEqual({ kind: "next" })
    expect(parseCookCommand("okay next step please")).toEqual({ kind: "next" })
    expect(parseCookCommand("Go back.")).toEqual({ kind: "back" })
    expect(parseCookCommand("say that again")).toEqual({ kind: "repeat" })
    expect(parseCookCommand("What do I need?")).toEqual({ kind: "ingredients" })
    expect(parseCookCommand("stop")).toEqual({ kind: "stop" })
    expect(parseCookCommand("I'm done")).toEqual({ kind: "done" })
    expect(parseCookCommand("start the timer")).toEqual({ kind: "stepTimer" })
  })

  test("ignores conversation that happens to contain a command word", () => {
    expect(parseCookCommand("what's next for dinner tomorrow")).toBeNull()
    expect(parseCookCommand("I'll be back in a minute")).toBeNull()
    expect(parseCookCommand("")).toBeNull()
  })

  test("sets timers, in digits or words", () => {
    expect(parseCookCommand("set a timer for 10 minutes")).toEqual({
      kind: "timer",
      seconds: 600,
      label: "10 min",
    })
    expect(parseCookCommand("start a five minute timer")).toEqual({
      kind: "timer",
      seconds: 300,
      label: "5 min",
    })
    expect(parseCookCommand("timer 90 seconds")).toEqual({
      kind: "timer",
      seconds: 90,
      label: "90 sec",
    })
    expect(parseCookCommand("timer for twenty five minutes")).toEqual({
      kind: "timer",
      seconds: 1500,
      label: "25 min",
    })
    expect(parseCookCommand("set a timer for half an hour")).toEqual({
      kind: "timer",
      seconds: 1800,
      label: "30 min",
    })
    expect(parseCookCommand("an hour timer")).toEqual({
      kind: "timer",
      seconds: 3600,
      label: "1 hr",
    })
    // A duration without "timer" isn't a timer.
    expect(parseCookCommand("10 minutes")).toBeNull()
  })

  test("asks how much of something", () => {
    expect(parseCookCommand("how much garlic")).toEqual({
      kind: "howMuch",
      food: "garlic",
    })
    expect(parseCookCommand("How many eggs do I need?")).toEqual({
      kind: "howMuch",
      food: "eggs",
    })
    expect(parseCookCommand("how much of the butter again")).toEqual({
      kind: "howMuch",
      food: "butter",
    })
  })
})

describe("choosing a voice", () => {
  const voice = (name: string, lang = "en-US", isDefault = false) => ({
    name,
    lang,
    default: isDefault,
  })
  const voices = [
    voice("Microsoft David - English (United States)", "en-US", true),
    voice("Microsoft Aria Online (Natural) - English (United States)"),
    voice("Google US English"),
    voice("Google UK English Female", "en-GB"),
    voice("Zarvox"),
    voice("Bad News"),
    voice("Ava (Premium)"),
    voice("Amélie", "fr-CA"),
  ]

  test("natural voices first, then Google's, then the rest", () => {
    expect(goodVoices(voices, "en-US").map((v) => v.name)).toEqual([
      "Ava (Premium)",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Google US English",
      "Google UK English Female",
      "Microsoft David - English (United States)",
    ])
  })

  test("leaves out joke voices and other languages", () => {
    const names = goodVoices(voices, "en-US").map((v) => v.name)
    expect(names).not.toContain("Zarvox")
    expect(names).not.toContain("Bad News")
    expect(names).not.toContain("Amélie")
    expect(voiceScore(voice("Amélie", "fr-CA"), "en-US")).toBe(-1)
  })

  test("prefers the exact language when quality is equal", () => {
    expect(
      goodVoices(
        [
          voice("Google UK English Female", "en-GB"),
          voice("Google US English"),
        ],
        "en-US"
      )[0]!.name
    ).toBe("Google US English")
  })

  test("short labels", () => {
    expect(
      voiceLabel(
        voice("Microsoft Aria Online (Natural) - English (United States)")
      )
    ).toBe("Aria Online (Natural)")
    expect(voiceLabel(voice("Google US English"))).toBe("US English")
  })
})
