import * as React from "react"
import {
  CLEANUP_SECTION_NAMES,
  CLEANUP_SECTIONS,
  type CleanupSection,
  type Proposal,
  type Recipe,
} from "@mise/shared"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import { ProposalReview } from "./proposal-review"
import { useTidyUp } from "./use-cleanup"

const SECTION_HINTS: Record<CleanupSection, string> = {
  description: "Write one if it's missing",
  tags: "Suggest tags, reusing the ones you have",
  details: "Fill in missing servings and times",
  ingredients: "Consistent amounts, one ingredient per line",
  steps: "Short, clear steps without the filler",
}

/**
 * Tidy up a recipe: pick what to tidy, wait for the AI, then review its
 * suggestions. Opens straight to the review if suggestions are waiting.
 */
export function TidyUpDialog({
  recipe,
  pending,
  open,
  onOpenChange,
}: {
  recipe: Recipe
  pending: Proposal | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* Start fresh each time it opens. */}
        {open && (
          <TidyUp
            recipe={recipe}
            pending={pending ?? null}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TidyUp({
  recipe,
  pending,
  onDone,
}: {
  recipe: Recipe
  pending: Proposal | null
  onDone: () => void
}) {
  const tidyUp = useTidyUp(recipe.id)
  const [sections, setSections] = React.useState<Set<CleanupSection>>(
    () => new Set(CLEANUP_SECTIONS)
  )
  const [result, setResult] = React.useState<Proposal | null | undefined>(
    pending ?? undefined
  )

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Tidy-up suggestions</DialogTitle>
          <DialogDescription>
            Keep what you like. The current version stays in History.
          </DialogDescription>
        </DialogHeader>
        <ProposalReview proposal={result} onDone={onDone} />
      </>
    )
  }

  if (result === null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Already tidy</DialogTitle>
          <DialogDescription>
            Nothing worth changing in {recipe.name}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    )
  }

  const error =
    tidyUp.error instanceof ApiError
      ? tidyUp.error.message
      : tidyUp.error
        ? "Couldn't reach Mise. Check your connection."
        : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tidy up {recipe.name}</DialogTitle>
        <DialogDescription>
          The AI suggests changes and you choose what to keep. Amounts and the
          method stay as they are.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        {CLEANUP_SECTIONS.map((section) => (
          <label key={section} className="flex items-start gap-3">
            <Checkbox
              className="mt-0.5"
              checked={sections.has(section)}
              disabled={tidyUp.isPending}
              onCheckedChange={(on) =>
                setSections((current) => {
                  const next = new Set(current)
                  if (on === true) next.add(section)
                  else next.delete(section)
                  return next
                })
              }
            />
            <span className="grid gap-0.5">
              <span className="font-medium">
                {CLEANUP_SECTION_NAMES[section]}
              </span>
              <span className="text-sm text-muted-foreground">
                {SECTION_HINTS[section]}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <Button
          disabled={tidyUp.isPending || sections.size === 0}
          onClick={() => tidyUp.mutate([...sections], { onSuccess: setResult })}
        >
          {tidyUp.isPending && <Spinner data-icon="inline-start" />}
          {tidyUp.isPending ? "Tidying… about half a minute" : "Tidy up"}
        </Button>
      </DialogFooter>
    </>
  )
}
