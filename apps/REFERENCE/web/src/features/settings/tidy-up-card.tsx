import { Link } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  useCancelCleanupJob,
  useCleanupJob,
  useStartCleanupJob,
} from "@/features/recipes/use-cleanup"
import { ApiError } from "@/lib/api"

import { useHouseholdInfo, useUpdateHousehold } from "./use-household"

/**
 * Household admins: tidy every new import automatically, and the whole
 * library at once. Uses the server's AI keys.
 */
export function TidyUpCard() {
  const household = useHouseholdInfo()
  const update = useUpdateHousehold()
  const cleanup = useCleanupJob(true)
  const start = useStartCleanupJob()
  const cancel = useCancelCleanupJob()
  const job = cleanup.data?.job
  const running = job?.status === "running"
  const untidied = cleanup.data?.untidied ?? 0

  function fail(error: unknown) {
    toast.error(error instanceof ApiError ? error.message : "Couldn't do that")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tidying up</CardTitle>
        <CardDescription>
          AI suggests cleaner ingredients and steps, tags and missing details.
          Nothing changes until you review it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5">
          <Field orientation="horizontal">
            <Checkbox
              id="auto-cleanup"
              checked={household.data?.autoCleanup ?? false}
              disabled={!household.data || update.isPending}
              onCheckedChange={(on) =>
                update.mutate({ autoCleanup: on === true }, { onError: fail })
              }
            />
            <div className="grid gap-1">
              <FieldLabel htmlFor="auto-cleanup">
                Tidy up every new import
              </FieldLabel>
              <FieldDescription>
                Suggestions wait on the recipe for you to review.
              </FieldDescription>
            </div>
          </Field>

          <Field>
            <FieldLabel>The whole library</FieldLabel>
            {cleanup.isPending ? (
              <Skeleton className="h-9" />
            ) : running && job ? (
              <div className="grid gap-2">
                <Progress
                  value={((job.done + job.failed) / job.total) * 100}
                  aria-label="Tidy-up progress"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {job.done + job.failed} of {job.total} recipes
                    {job.proposals > 0 &&
                      ` · ${job.proposals} with suggestions`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(job.id, { onError: fail })}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={start.isPending || untidied === 0}
                  onClick={() =>
                    start.mutate(undefined, {
                      onSuccess: ({ job }) =>
                        toast.success(`Tidying ${job.total} recipes`, {
                          description:
                            "Suggestions collect in Review as they're ready.",
                        }),
                      onError: fail,
                    })
                  }
                >
                  {start.isPending && <Spinner data-icon="inline-start" />}
                  {untidied === 0
                    ? "Everything's been tidied"
                    : `Tidy ${untidied} ${untidied === 1 ? "recipe" : "recipes"}`}
                </Button>
                {job && job.proposals > 0 && (
                  <Button variant="link" className="px-0" asChild>
                    <Link to="/review">
                      Review {job.proposals}{" "}
                      {job.proposals === 1 ? "suggestion" : "suggestions"}
                    </Link>
                  </Button>
                )}
              </div>
            )}
            <FieldDescription>
              {job?.status === "failed"
                ? "The last run stopped because the AI kept failing. The server admin may need to check the AI key."
                : job?.status === "interrupted"
                  ? "The last run was cut short by a restart. Start it again to carry on."
                  : "Goes through recipes that haven't been tidied yet, in the background. You review the suggestions after."}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
