import * as React from "react"
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

/** Under a step rewritten for a swap: that it changed, and how it read before. */
export function ChangedStepNote({ original }: { original: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="grid gap-1.5 text-sm text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
          Changed for the swap
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {open ? "Hide the original" : "Show the original"}
        </button>
      </p>
      {open && <p className="italic">{original}</p>}
    </div>
  )
}
