import type { StepPiece } from "@mise/shared"

/** A name swapped into a step this time, marked so it's clear what changed. */
export function SwappedWord({ piece }: { piece: StepPiece }) {
  return (
    <span
      className="rounded-md bg-accent px-1 text-accent-foreground underline decoration-dotted underline-offset-4"
      title={`Instead of ${piece.insteadOf}`}
    >
      {piece.text}
      <span className="sr-only"> (instead of {piece.insteadOf})</span>
    </span>
  )
}
