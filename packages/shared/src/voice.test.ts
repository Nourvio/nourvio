import { describe, expect, it } from "vitest"

import {
  isEnglishKokoroVoice,
  isOldKokoroVoice,
  kokoroVoiceName,
  previewVoiceInput,
  updateVoiceSettingsInput,
} from "./voice.ts"

describe("Kokoro voices", () => {
  it("names them from their ids", () => {
    expect(kokoroVoiceName("af_heart")).toBe("Heart, American")
    expect(kokoroVoiceName("bm_lewis")).toBe("Lewis, British")
    expect(kokoroVoiceName("ff_siwis")).toBe("Siwis, French")
    expect(kokoroVoiceName("af_amelia_inno")).toBe("Amelia, American")
  })

  it("tells English and older voices apart", () => {
    expect(isEnglishKokoroVoice("bf_emma")).toBe(true)
    expect(isEnglishKokoroVoice("jf_alpha")).toBe(false)
    expect(isOldKokoroVoice("af_v0bella")).toBe(true)
    expect(isOldKokoroVoice("af_bella")).toBe(false)
  })

  it("takes every id Kokoro lists", () => {
    for (const voice of ["af_heart", "af_amelia_inno", "am_v0gurney"]) {
      expect(
        updateVoiceSettingsInput.safeParse({
          provider: "kokoro",
          kokoroVoice: voice,
        }).success
      ).toBe(true)
      expect(
        previewVoiceInput.safeParse({ provider: "kokoro", voice }).success
      ).toBe(true)
    }
    expect(
      previewVoiceInput.safeParse({ provider: "kokoro", voice: "af heart" })
        .success
    ).toBe(false)
  })
})
