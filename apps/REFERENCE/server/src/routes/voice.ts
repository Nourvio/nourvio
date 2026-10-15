import {
  previewVoiceInput,
  speakInput,
  updateVoiceSettingsInput,
} from "@mise/shared"
import { Hono } from "hono"

import { requireServerAdmin, requireUser } from "../auth/middleware.ts"
import { currentHousehold, currentUser, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import type { VoiceService } from "../services/voice.ts"

/** Cook mode's voice: whether the server reads aloud, the audio, and the admin's settings. */
export function voiceRoutes(voice: VoiceService) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) => c.json({ status: await voice.status() }))

  /** A step read aloud, as MP3. */
  app.post("/speak", async (c) => {
    const { text } = await readBody(c, speakInput)
    const audio = await voice.speak(
      { userId: currentUser(c).id, householdId: currentHousehold(c) },
      text
    )
    return c.body(new Uint8Array(audio), 200, {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=86400",
    })
  })

  /** A sample in any voice, to hear before picking it. */
  app.post("/preview", requireServerAdmin, async (c) => {
    const input = await readBody(c, previewVoiceInput)
    const audio = await voice.preview(
      { userId: currentUser(c).id, householdId: currentHousehold(c) },
      input
    )
    return c.body(new Uint8Array(audio), 200, {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=86400",
    })
  })

  app.get("/settings", requireServerAdmin, async (c) =>
    c.json({ settings: await voice.getSettings() })
  )

  app.put("/settings", requireServerAdmin, async (c) => {
    const input = await readBody(c, updateVoiceSettingsInput)
    return c.json({ settings: await voice.updateSettings(input) })
  })

  return app
}
