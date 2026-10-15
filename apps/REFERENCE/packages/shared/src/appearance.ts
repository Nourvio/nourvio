import { z } from "zod"

export const MODES = ["light", "dark", "system"] as const
export const PALETTES = ["sage", "paprika", "castiron"] as const

export type Mode = (typeof MODES)[number]
export type PaletteName = (typeof PALETTES)[number]

export const appearanceSchema = z.object({
  mode: z.enum(MODES),
  palette: z.enum(PALETTES),
})

export type Appearance = z.infer<typeof appearanceSchema>

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  palette: "sage",
}
