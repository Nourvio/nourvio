import * as React from "react"
import { mealieConnectionInput, type MealieCheck } from "@mise/shared"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useForm } from "@/lib/form"

import {
  useCheckMealie,
  useMealieJob,
  useStartMealieImport,
} from "./use-mealie"

/** Admin only: move the whole Mealie library over, photos and all. */
export function MealieCard() {
  const job = useMealieJob()
  const check = useCheckMealie()
  const start = useStartMealieImport()
  const form = useForm(mealieConnectionInput, { url: "", token: "" })
  const [found, setFound] = React.useState<MealieCheck | null>(null)
  const running = job.data?.status === "running"
  const url = form.bind("url")
  const token = form.bind("token")

  function onCheck(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    setFound(null)
    check.mutate(input, { onSuccess: setFound, onError: form.showError })
  }

  function onImport() {
    const input = form.validate()
    if (!input) return
    start.mutate(input, {
      onSuccess: ({ job }) => {
        setFound(null)
        toast.success(`Moving ${job.total} recipes from Mealie`, {
          description: "They appear in Recipes as they arrive.",
        })
      },
      onError: form.showError,
    })
  }

  const toMove = found ? found.total - found.alreadyImported : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Move from Mealie</CardTitle>
        <CardDescription>
          Bring every recipe into your household, with its photo, rating and
          last-made date. It's safe to run again: recipes already moved are
          skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {job.data && <MealieProgress job={job.data} />}
        {!running && (
          <form className="grid gap-4" onSubmit={onCheck}>
            <FieldGroup>
              <TextField
                id="mealie-url"
                label="Mealie address"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="http://192.168.1.20:9000"
                {...url}
                error={form.errors.url}
                description="The address the Nourvio server can reach Mealie at, such as its local IP and port."
                onChange={(event) => {
                  url.onChange(event)
                  setFound(null)
                }}
              />
              <TextField
                id="mealie-token"
                label="Mealie API token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                {...token}
                error={form.errors.token}
                description="In Mealie: your profile → API Tokens → Generate. It's used for this import only and isn't saved."
                onChange={(event) => {
                  token.onChange(event)
                  setFound(null)
                }}
              />
            </FieldGroup>
            {found ? (
              <Alert>
                <AlertTitle>
                  Connected{found.version ? ` to Mealie ${found.version}` : ""}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {found.total} {found.total === 1 ? "recipe" : "recipes"}
                    {found.alreadyImported > 0 &&
                      `, ${found.alreadyImported} already here`}
                    .
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {found ? (
                <Button
                  type="button"
                  disabled={start.isPending || toMove <= 0}
                  onClick={onImport}
                >
                  {start.isPending && <Spinner data-icon="inline-start" />}
                  {toMove > 0
                    ? `Move ${toMove} ${toMove === 1 ? "recipe" : "recipes"}`
                    : "Everything's already here"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="outline"
                  disabled={check.isPending}
                >
                  {check.isPending && <Spinner data-icon="inline-start" />}
                  Connect
                </Button>
              )}
            </div>
            {form.formError && (
              <p className="text-sm text-destructive">{form.formError}</p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function MealieProgress({
  job,
}: {
  job: NonNullable<ReturnType<typeof useMealieJob>["data"]>
}) {
  const handled = job.imported + job.skipped + job.failed
  const parts = [
    `${job.imported} moved`,
    job.skipped > 0 && `${job.skipped} already here`,
    job.failed > 0 && `${job.failed} couldn't be read`,
  ].filter(Boolean)

  if (job.status === "running") {
    return (
      <div className="grid gap-2">
        <Progress
          value={(handled / Math.max(job.total, 1)) * 100}
          aria-label="Mealie import progress"
        />
        <p className="text-sm text-muted-foreground">
          {handled} of {job.total} · {parts.join(" · ")}
        </p>
      </div>
    )
  }
  return (
    <Alert>
      <AlertTitle>
        {job.status === "done"
          ? "Last import finished"
          : job.status === "interrupted"
            ? "Last import was cut short by a restart"
            : "Last import stopped early"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {parts.join(" · ")}.
          {job.status !== "done" && " Run it again to pick up the rest."}
          {job.status === "done" &&
            job.imported > 0 &&
            " Next, tidy them up under Tidying up."}
        </p>
      </AlertDescription>
    </Alert>
  )
}
