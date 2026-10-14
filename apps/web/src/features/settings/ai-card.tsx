import * as React from "react"
import {
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  AI_TASK_NAMES,
  AI_TASKS,
  DEFAULT_MODELS,
  parseModelRef,
  type AiKeyStatus,
  type AiModel,
  type AiProviderId,
  type AiSettings,
  type AiTask,
  type AiUsageRow,
  type ModelRef,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  useCancelCleanupJob,
  useCleanupJob,
  useStartCleanupJob,
} from "@/features/recipes/use-cleanup"
import { ApiError } from "@/lib/api"

import {
  useAiModels,
  useAiSettings,
  useAiUsage,
  useTestAiKey,
  useUpdateAiSettings,
} from "./use-ai"

const KEY_PAGES: Record<AiProviderId, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
}

const ENV_NAMES: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
}

const PLACEHOLDERS: Record<AiProviderId, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
}

/** Admin only: API keys, which model does what, and what it's costing. */
export function AiCard() {
  const settings = useAiSettings()
  const anyKey = settings.data
    ? AI_PROVIDERS.some((id) => settings.data.keys[id].configured)
    : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI</CardTitle>
        <CardDescription>
          Claude or OpenAI reads recipes from text, photos and videos, tidies
          them up and powers the assistant. Each provider bills you per use,
          separately from any ChatGPT or Claude subscription.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <div className="grid gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : settings.isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the AI settings.
          </p>
        ) : (
          <FieldGroup>
            {AI_PROVIDERS.map((id) => (
              <KeyField
                key={id}
                provider={id}
                status={settings.data.keys[id]}
              />
            ))}
            {anyKey && (
              <>
                <FieldSeparator />
                <ModelFields settings={settings.data} />
                <FieldSeparator />
                <CleanupFields settings={settings.data} />
                <FieldSeparator />
                <UsageSummary />
              </>
            )}
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

function KeyField({
  provider,
  status,
}: {
  provider: AiProviderId
  status: AiKeyStatus
}) {
  const name = AI_PROVIDER_NAMES[provider]
  const id = `${provider}-key`
  const [editing, setEditing] = React.useState(false)
  const [key, setKey] = React.useState("")
  const [error, setError] = React.useState<string>()
  const test = useTestAiKey()
  const update = useUpdateAiSettings()
  const busy = test.isPending || update.isPending
  const showInput = status.source !== "env" && (!status.configured || editing)

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Couldn't reach Mise")
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    const trimmed = key.trim()
    // Check the key works before keeping it.
    test.mutate(
      { provider, key: trimmed },
      {
        onSuccess: () =>
          update.mutate(
            { keys: { [provider]: trimmed } },
            {
              onSuccess: () => {
                toast.success(`${name} key saved`)
                setKey("")
                setEditing(false)
              },
              onError: fail,
            }
          ),
        onError: fail,
      }
    )
  }

  function checkSaved() {
    setError(undefined)
    test.mutate(
      { provider },
      {
        onSuccess: ({ models }) =>
          toast.success(`${name} key works`, {
            description: `${models} models available`,
          }),
        onError: fail,
      }
    )
  }

  function remove() {
    update.mutate(
      { keys: { [provider]: null } },
      {
        onSuccess: () => toast.success(`${name} key removed`),
        onError: fail,
      }
    )
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={showInput ? id : undefined}>
        {name} API key
        {status.configured && (
          <Badge variant="secondary">
            {status.source === "env" ? "Set on the server" : "Saved"}
          </Badge>
        )}
      </FieldLabel>

      {showInput ? (
        <form className="flex flex-wrap gap-2" onSubmit={save}>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={PLACEHOLDERS[provider]}
            className="min-w-0 flex-1 basis-56"
            value={key}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setKey(event.target.value)}
          />
          <Button type="submit" disabled={busy || key.trim().length < 10}>
            {busy && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setError(undefined)
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-muted px-2 py-1 text-sm">
            {status.hint}
          </code>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={checkSaved}
          >
            {test.isPending && <Spinner data-icon="inline-start" />}
            Test
          </Button>
          {status.source === "settings" && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={remove}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      )}

      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>
          {status.source === "env" ? (
            <>
              Change it with <code>{ENV_NAMES[provider]}</code> on the server.
            </>
          ) : status.configured ? (
            "Stored encrypted. Only the last four characters are shown."
          ) : (
            <>
              Create one at{" "}
              <a
                href={KEY_PAGES[provider]}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {new URL(KEY_PAGES[provider]).host}
              </a>
              , or set <code>{ENV_NAMES[provider]}</code> on the server.
            </>
          )}
        </FieldDescription>
      )}
    </Field>
  )
}

const DEFAULT_CHOICE = "__default"

function ModelFields({ settings }: { settings: AiSettings }) {
  const models = useAiModels(true)
  const update = useUpdateAiSettings()
  const configured = AI_PROVIDERS.filter((id) => settings.keys[id].configured)
  const automatic = configured[0]

  function save(input: Parameters<typeof update.mutate>[0], label: string) {
    update.mutate(input, {
      onSuccess: () => toast.success(`${label} updated`),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't save"
        ),
    })
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Models</FieldLegend>
      <FieldDescription>
        Bigger models are better at messy recipes and cost more. Each job can
        use its own.
      </FieldDescription>
      <FieldGroup className="gap-4">
        <ModelSelect
          id="model-default"
          label="Default"
          value={settings.defaultModel}
          emptyLabel={
            automatic
              ? `Automatic (${modelName(`${automatic}:${DEFAULT_MODELS[automatic]}`, models.data)})`
              : "Automatic"
          }
          models={models.data}
          loading={models.isPending}
          configured={configured}
          onChange={(defaultModel) => save({ defaultModel }, "Default model")}
        />
        {AI_TASKS.map((task: AiTask) => (
          <ModelSelect
            key={task}
            id={`model-${task}`}
            label={AI_TASK_NAMES[task]}
            value={settings.taskModels[task] ?? null}
            emptyLabel="Same as default"
            models={models.data}
            loading={models.isPending}
            configured={configured}
            onChange={(ref) =>
              save({ taskModels: { [task]: ref } }, AI_TASK_NAMES[task])
            }
          />
        ))}
      </FieldGroup>
    </FieldSet>
  )
}

function modelName(ref: string, models: AiModel[] | undefined) {
  const { provider, model } = parseModelRef(ref)
  return (
    models?.find((m) => m.provider === provider && m.id === model)?.name ??
    model
  )
}

function ModelSelect({
  id,
  label,
  value,
  emptyLabel,
  models,
  loading,
  configured,
  onChange,
}: {
  id: string
  label: string
  value: ModelRef | null
  emptyLabel: string
  models: AiModel[] | undefined
  loading: boolean
  configured: AiProviderId[]
  onChange: (ref: ModelRef | null) => void
}) {
  // A saved pick that the provider no longer lists still needs to show.
  const saved = value ? parseModelRef(value) : null
  const listed = (models ?? []).some(
    (m) => saved && m.provider === saved.provider && m.id === saved.model
  )
  const options: AiModel[] = [
    ...(saved && !listed
      ? [{ provider: saved.provider, id: saved.model, name: saved.model }]
      : []),
    ...(models ?? []),
  ]

  return (
    <Field orientation="responsive">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value ?? DEFAULT_CHOICE}
        onValueChange={(next) =>
          onChange(next === DEFAULT_CHOICE ? null : (next as ModelRef))
        }
      >
        <SelectTrigger id={id} className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_CHOICE}>{emptyLabel}</SelectItem>
          {loading && (
            <SelectItem value="__loading" disabled>
              Loading models…
            </SelectItem>
          )}
          {configured.map((provider) => {
            const group = options.filter((m) => m.provider === provider)
            if (!group.length) return null
            return (
              <React.Fragment key={provider}>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{AI_PROVIDER_NAMES[provider]}</SelectLabel>
                  {group.map((model) => (
                    <SelectItem
                      key={`${provider}:${model.id}`}
                      value={`${provider}:${model.id}`}
                    >
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </React.Fragment>
            )
          })}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Tidying up: automatically after imports, and the whole library at once. */
function CleanupFields({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiSettings()
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
    <FieldSet>
      <FieldLegend variant="label">Tidying up</FieldLegend>
      <FieldGroup className="gap-5">
        <Field orientation="horizontal">
          <Checkbox
            id="auto-cleanup"
            checked={settings.autoCleanup}
            disabled={update.isPending}
            onCheckedChange={(on) =>
              update.mutate({ autoCleanup: on === true }, { onError: fail })
            }
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor="auto-cleanup">
              Tidy up every new import
            </FieldLabel>
            <FieldDescription>
              Suggestions wait on the recipe for you to review. Each one costs a
              few cents.
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
                  {job.proposals > 0 && ` · ${job.proposals} with suggestions`}
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
              ? "The last run stopped because the AI kept failing. Check the key and try again."
              : job?.status === "interrupted"
                ? "The last run was cut short by a restart. Start it again to carry on."
                : "Goes through recipes that haven't been tidied yet, in the background. You review the suggestions after."}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}

const MONTH = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
})
const TOKENS = new Intl.NumberFormat(undefined, { notation: "compact" })
const DOLLARS = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function UsageSummary() {
  const usage = useAiUsage()
  const months = React.useMemo(() => {
    const grouped = new Map<string, AiUsageRow[]>()
    for (const row of usage.data ?? []) {
      grouped.set(row.month, [...(grouped.get(row.month) ?? []), row])
    }
    return [...grouped]
  }, [usage.data])

  return (
    <FieldSet>
      <FieldLegend variant="label">Usage</FieldLegend>
      {usage.isPending ? (
        <Skeleton className="h-12" />
      ) : months.length === 0 ? (
        <FieldDescription>Nothing yet.</FieldDescription>
      ) : (
        <div className="grid gap-4">
          {months.map(([month, rows]) => {
            const known = rows.filter((r) => r.costUsd !== null)
            const cost = known.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
            const [year, monthNumber] = month.split("-").map(Number)
            return (
              <div key={month} className="grid gap-1.5 text-sm">
                <div className="flex justify-between gap-4 font-medium">
                  <span>{MONTH.format(new Date(year!, monthNumber! - 1))}</span>
                  <span>
                    {known.length ? DOLLARS.format(cost) : "—"}
                    {known.length > 0 && known.length < rows.length && "+"}
                  </span>
                </div>
                {rows.map((row) => (
                  <div
                    key={`${row.provider}:${row.model}`}
                    className="flex justify-between gap-4 text-muted-foreground"
                  >
                    <span className="truncate">
                      {row.model} · {row.requests}{" "}
                      {row.requests === 1 ? "request" : "requests"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {TOKENS.format(row.inputTokens + row.outputTokens)} tokens
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
          <FieldDescription>
            Costs are estimates from list prices. Your provider's bill is the
            real number.
          </FieldDescription>
        </div>
      )}
    </FieldSet>
  )
}
