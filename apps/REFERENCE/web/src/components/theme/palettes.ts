import type { PaletteName } from "@mise/shared"

/** The palette names live in @mise/shared, because accounts save them too. */
export type Palette = PaletteName

export type PaletteOption = {
  value: Palette
  name: string
  description: string
  /** Fixed preview colors, so every option shows its own colors in the picker. */
  swatches: { background: string; primary: string; highlight: string }
}

// Keep in sync with the token blocks in src/index.css.
export const PALETTES: PaletteOption[] = [
  {
    value: "sage",
    name: "Sage & Cream",
    description: "Herb green on warm cream, terracotta highlights",
    swatches: {
      background: "#fdfaf4",
      primary: "#356844",
      highlight: "#ae532d",
    },
  },
  {
    value: "paprika",
    name: "Paprika & Linen",
    description: "Burnt orange on linen, olive highlights",
    swatches: {
      background: "#fdf8f1",
      primary: "#be4806",
      highlight: "#6a7a31",
    },
  },
  {
    value: "castiron",
    name: "Cast Iron & Saffron",
    description: "Warm charcoal with saffron accents",
    swatches: {
      background: "#fbfaf7",
      primary: "#2d2823",
      highlight: "#edb333",
    },
  },
]

export const PALETTE_VALUES = PALETTES.map((p) => p.value)
export const DEFAULT_PALETTE: Palette = "sage"
