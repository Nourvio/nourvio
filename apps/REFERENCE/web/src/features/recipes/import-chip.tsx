import * as React from "react"
import type { ImportBatchSummary } from "@mise/shared"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { Link } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

import { useCurrentImport } from "./use-import-batches"

const DISMISSED_KEY = "mise.import-dismissed"

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/** "Added 9 recipes, 1 didn't work" */
function howItWent(batch: ImportBatchSummary) {
  const failed = `${batch.failed} didn't work`
  if (!batch.added) {
    return batch.failed ? `No new recipes: ${failed}` : "No new recipes"
  }
  const added = `Added ${batch.added} ${batch.added === 1 ? "recipe" : "recipes"}`
  return batch.failed ? `${added}, ${failed}` : added
}

/**
 * The latest bulk import, on Recipes: "Importing 6 of 10" while it runs,
 * then how it went until it's put away. A toast too, if it finishes while
 * Recipes is open.
 */
export function ImportChip() {
  const batch = useCurrentImport().data
  const [dismissed, setDismissed] = React.useState(readDismissed)

  const running = React.useRef(false)
  React.useEffect(() => {
    if (!batch) return
    if (!batch.finishedAt) {
      running.current = true
    } else if (running.current) {
      running.current = false
      toast.success(`Import finished. ${howItWent(batch)}.`)
    }
  }, [batch])

  if (!batch || (batch.finishedAt && dismissed === batch.id)) return null

  function dismiss() {
    if (!batch) return
    setDismissed(batch.id)
    try {
      localStorage.setItem(DISMISSED_KEY, batch.id)
    } catch {
      // Private windows can refuse; it just comes back next time.
    }
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
      {batch.finishedAt ? (
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-5 shrink-0 text-primary"
        />
      ) : (
        <Spinner className="shrink-0" />
      )}
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="truncate text-sm font-medium">
          {batch.finishedAt
            ? howItWent(batch)
            : `Importing recipes: ${batch.done} of ${batch.total} done`}
        </p>
        {!batch.finishedAt && (
          <Progress
            value={(batch.done / Math.max(batch.total, 1)) * 100}
            className="h-1.5"
            aria-hidden="true"
          />
        )}
      </div>
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/recipes/import/${batch.id}`}>See</Link>
      </Button>
      {batch.finishedAt && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Put away"
          onClick={dismiss}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}
