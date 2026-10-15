import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import {
  useNutritionLibrary,
  useStartNutritionLibrary,
  useStopNutritionLibrary,
} from "./use-nutrition"

/** Household admins: work out nutrition for every recipe that has none. */
export function NutritionLibraryCard() {
  const library = useNutritionLibrary()
  const start = useStartNutritionLibrary()
  const stop = useStopNutritionLibrary()
  const queryClient = useQueryClient()
  const job = library.data?.job
  const running = job?.status === "running"
  const missing = library.data?.missing ?? 0
  const noServings = library.data?.noServings ?? 0

  // Recipes changed under the run: refresh them when it finishes.
  const wasRunning = React.useRef(running)
  React.useEffect(() => {
    if (wasRunning.current && !running) {
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe"] })
      queryClient.invalidateQueries({ queryKey: ["plan"] })
    }
    wasRunning.current = running
  }, [running, queryClient])

  function fail(error: unknown) {
    toast.error(error instanceof ApiError ? error.message : "Couldn't do that")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
        <CardDescription>
          New and changed recipes get their nutrition worked out by themselves.
          This catches up the rest, such as a Mealie import.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {library.isPending ? (
          <Skeleton className="h-9" />
        ) : running && job ? (
          <div className="grid gap-2">
            <Progress
              value={((job.done + job.failed) / job.total) * 100}
              aria-label="Nutrition progress"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {job.done + job.failed} of {job.total} recipes
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={stop.isPending}
                onClick={() => stop.mutate(job.id, { onError: fail })}
              >
                Stop
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              variant="outline"
              disabled={start.isPending || missing === 0}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: ({ job }) =>
                    toast.success(
                      `Working out nutrition for ${job.total} recipes`
                    ),
                  onError: fail,
                })
              }
            >
              {start.isPending && <Spinner data-icon="inline-start" />}
              {missing === 0
                ? "Every recipe has nutrition"
                : `Work out ${missing} ${missing === 1 ? "recipe" : "recipes"}`}
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {job?.status === "failed"
            ? "The last run stopped because it kept failing. The server admin may need to check the USDA or AI key."
            : job?.status === "interrupted"
              ? "The last run was cut short by a restart. Start it again to carry on."
              : running
                ? "Runs in the background. If USDA's hourly limit is reached, it waits and carries on."
                : noServings > 0
                  ? `${noServings} ${noServings === 1 ? "recipe needs" : "recipes need"} servings set before nutrition can be worked out.`
                  : "Each food is looked up once, so later recipes go quicker."}
        </p>
      </CardContent>
    </Card>
  )
}
