import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMe, useRefreshAll } from "@/features/auth/use-me"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { householdJobQuery, isActive } from "./queries"

type Target = "this" | "new"

/** The zip itself is the body, not JSON. */
const asZip = (file: File) => ({
  body: file as unknown as string,
  bodySerializer: (body: unknown) => body as BodyInit,
  headers: { "content-type": "application/zip" },
})

/**
 * Imports a Merran export, into this household or (for the server admin) as
 * a new one, then follows the import as it runs.
 */
export function ImportCard() {
  const { t } = useTranslation()
  const me = useMe()
  const refreshAll = useRefreshAll()
  const [file, setFile] = React.useState<File | null>(null)
  const [target, setTarget] = React.useState<Target>("this")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const picker = React.useRef<HTMLInputElement>(null)

  async function start() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (target === "new") {
        const made = await unwrap(
          api.POST("/api/households/import", asZip(file))
        )
        setJobId(made.job.id)
        // The new household is the one in use now: everything follows it.
        await refreshAll()
      } else {
        const job = await unwrap(
          api.POST("/api/households/current/import", asZip(file))
        )
        setJobId(job.id)
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function again() {
    setJobId(null)
    setFile(null)
    if (picker.current) picker.current.value = ""
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.transfer.import.title")}</CardTitle>
        <CardDescription>
          {t("settings.transfer.import.description")}
        </CardDescription>
      </CardHeader>
      {jobId ? (
        <ImportProgress jobId={jobId} onAgain={again} />
      ) : (
        <>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="import-file">
                  {t("settings.transfer.import.file")}
                </FieldLabel>
                <Input
                  ref={picker}
                  id="import-file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null)
                    setError(null)
                  }}
                />
              </Field>
              {me.serverAdmin && (
                <Field>
                  <FieldLabel>{t("settings.transfer.import.into")}</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    value={[target]}
                    onValueChange={(value) => {
                      const next = value[0] as Target | undefined
                      if (next) setTarget(next)
                    }}
                    aria-label={t("settings.transfer.import.into")}
                  >
                    <ToggleGroupItem value="this">
                      {t("settings.transfer.import.thisHousehold")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="new">
                      {t("settings.transfer.import.newHousehold")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {target === "new" && (
                    <FieldDescription>
                      {t("settings.transfer.import.newHint")}
                    </FieldDescription>
                  )}
                </Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={!file || busy} onClick={() => void start()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy
                ? t("settings.transfer.import.uploading")
                : t("settings.transfer.import.start")}
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}

/** How the import is getting on, and what it did. */
function ImportProgress({
  jobId,
  onAgain,
}: {
  jobId: string
  onAgain: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const { data: job } = useQuery(householdJobQuery(jobId))
  const [stopping, setStopping] = React.useState(false)

  // Once it's finished, the recipes it brought in show everywhere.
  const finished = Boolean(job && !isActive(job))
  const refreshed = React.useRef(false)
  React.useEffect(() => {
    if (!finished || refreshed.current) return
    refreshed.current = true
    void refreshRecipes()
  }, [finished, refreshRecipes])

  async function stop() {
    setStopping(true)
    try {
      queryClient.setQueryData(
        householdJobQuery(jobId).queryKey,
        await unwrap(
          api.POST("/api/households/current/jobs/{jobId}/cancel", {
            params: { path: { jobId } },
          })
        )
      )
    } finally {
      setStopping(false)
    }
  }

  const result = job?.result as
    { recipes?: number; skipped?: number } | null | undefined
  const percent =
    job?.progress && job.progress.total > 0
      ? Math.round((job.progress.done / job.progress.total) * 100)
      : 0

  return (
    <>
      <CardContent className="grid gap-3" aria-live="polite">
        {!job || job.status === "queued" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("settings.transfer.import.waiting")}
          </p>
        ) : job.status === "running" ? (
          <>
            <Progress value={percent} />
            <p className="text-sm text-muted-foreground">
              {job.progress
                ? t("settings.transfer.import.progress", {
                    done: job.progress.done,
                    total: job.progress.total,
                  })
                : t("settings.transfer.import.waiting")}
            </p>
          </>
        ) : job.status === "done" ? (
          <p className="text-sm">
            {t("settings.transfer.import.done", {
              count: result?.recipes ?? 0,
            })}
            {(result?.skipped ?? 0) > 0 &&
              ` ${t("settings.transfer.import.skipped", {
                count: result?.skipped ?? 0,
              })}`}
          </p>
        ) : job.status === "failed" ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("settings.transfer.import.failed", { error: job.error })}
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.transfer.import.stopped")}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {job && isActive(job) ? (
          <Button
            variant="outline"
            disabled={stopping}
            onClick={() => void stop()}
          >
            {t("settings.transfer.import.stop")}
          </Button>
        ) : (
          <>
            {job?.status === "done" && (
              <Button onClick={() => void navigate({ to: "/recipes" })}>
                {t("settings.transfer.import.seeRecipes")}
              </Button>
            )}
            <Button variant="outline" onClick={onAgain}>
              {t("settings.transfer.import.another")}
            </Button>
          </>
        )}
      </CardFooter>
    </>
  )
}
