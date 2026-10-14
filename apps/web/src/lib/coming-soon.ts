import { toast } from "sonner"

/** Placeholder for buttons whose feature lands in a later milestone (see docs/roadmap.md). */
export function comingSoon(feature: string, milestone: number) {
  toast(`${feature} arrives in milestone ${milestone}`, {
    description: "The button is here so the layout is real.",
  })
}
