import * as React from "react"
import {
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  AI_TASK_NAMES,
  AI_TASKS,
  DEFAULT_MODELS,
  LIGHT_TASK_MODELS,
  parseModelRef,
  type AiKeyStatus,
  type AiModel,
  type AiProviderId,
  type AiSettings,
  type AiTask,
  type AiUsageRow,
  type ModelRef,
  PHOTO_COST_USD,
} from "@mise/shared"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
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
          them up and powers the assistant, for every household on this server.
          Each provider bills you per use, separately from any ChatGPT or Claude
          subscription.
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
                <PhotoFields settings={settings.data} />
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
    setError(e instanceof ApiError ? e.message : "Couldn't reach Nourvio")
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

/** Photos for recipes without one, made by OpenAI's image model in one house style. */
function PhotoFields({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiSettings()
  const hasOpenAi = settings.keys.openai.configured
  return (
    <FieldSet>
      <FieldLegend variant="label">Photos</FieldLegend>
      <FieldDescription>
        {hasOpenAi
          ? `Recipes without a photo can get one made by OpenAI, all in the same style: a dark plate on white marble. About ${PHOTO_COST_LABEL} each.`
          : "With an OpenAI key, recipes without a photo can get one made, all in the same style. Claude can't make pictures."}
      </FieldDescription>
      <Field orientation="horizontal">
        <Checkbox
          id="auto-photos"
          checked={settings.autoPhotos}
          disabled={!hasOpenAi || update.isPending}
          onCheckedChange={(checked) =>
            update.mutate(
              { autoPhotos: checked === true },
              {
                onSuccess: () =>
                  toast.success(
                    checked === true
                      ? "New recipes will get a photo"
                      : "New recipes won't get a photo made"
                  ),
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError ? error.message : "Couldn't save"
                  ),
              }
            )
          }
        />
        <FieldLabel htmlFor="auto-photos" className="font-normal">
          Make a photo for each new recipe that comes without one
        </FieldLabel>
      </Field>
    </FieldSet>
  )
}

const PHOTO_COST_LABEL = `${Math.round(PHOTO_COST_USD * 100)}¢`

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
            emptyLabel={
              LIGHT_TASK_MODELS[task]
                ? "A small model (Haiku or Luna)"
                : "Same as default"
            }
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
                    key={`${row.household}:${row.provider}:${row.model}`}
                    className="flex justify-between gap-4 text-muted-foreground"
                  >
                    <span className="truncate">
                      {row.household ?? "Removed household"} · {row.model} ·{" "}
                      {row.requests}{" "}
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
