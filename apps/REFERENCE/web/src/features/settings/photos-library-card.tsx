import * as React from "react"
import { PHOTO_COST_USD } from "@mise/shared"
import { useQueryClient } from "@tanstack/react-query"
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
  usePhotoLibrary,
  useStartPhotoLibrary,
  useStopPhotoLibrary,
} from "./use-photos"

/** Household admins: make photos for every recipe that has none. */
export function PhotosLibraryCard() {
  const library = usePhotoLibrary()
  const start = useStartPhotoLibrary()
  const stop = useStopPhotoLibrary()
  const queryClient = useQueryClient()
  const job = library.data?.job
  const running = job?.status === "running"
  const missing = library.data?.missing ?? 0
  const available = library.data?.available ?? false

  // Photos arrive as it goes: keep the library's cards fresh.
  const progress = job ? job.done + job.failed : 0
  React.useEffect(() => {
    if (progress > 0) {
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe"] })
    }
  }, [progress, queryClient])

  function fail(error: unknown) {
    toast.error(error instanceof ApiError ? error.message : "Couldn't do that")
  }

  const cost = (missing * PHOTO_COST_USD).toFixed(2)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
        <CardDescription>
          Recipes without a photo can get one made by AI, all plated the same
          way: a dark plate on white marble. Each is marked as an AI photo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {library.isPending ? (
          <Skeleton className="h-9" />
        ) : running && job ? (
          <div className="grid gap-2">
            <Progress
              value={((job.done + job.failed) / job.total) * 100}
              aria-label="Photo progress"
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
              disabled={start.isPending || missing === 0 || !available}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: ({ job }) =>
                    toast.success(`Making photos for ${job.total} recipes`),
                  onError: fail,
                })
              }
            >
              {start.isPending && <Spinner data-icon="inline-start" />}
              {missing === 0
                ? "Every recipe has a photo"
                : `Make ${missing} ${missing === 1 ? "photo" : "photos"}`}
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {!available
            ? "This needs an OpenAI key, which the server admin can add in Settings → AI."
            : job?.status === "failed"
              ? "The last run stopped because it kept failing. The server admin may need to check the OpenAI key, its credit, or the organization's verification."
              : job?.status === "interrupted"
                ? "The last run was cut short by a restart. Start it again to carry on."
                : running
                  ? "Runs in the background, a couple at a time. Each takes about half a minute."
                  : missing > 0
                    ? `About $${cost} in all, on the server's OpenAI key.`
                    : "New recipes get one by themselves when the server admin allows it."}
        </p>
      </CardContent>
    </Card>
  )
}
