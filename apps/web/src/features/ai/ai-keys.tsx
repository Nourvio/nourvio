import {
  Add01Icon,
  Delete02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { KEYED_PROVIDERS, PROVIDER_NAMES } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api/client"

import type { AiKey, NewAiKey } from "./queries"

type Choice = (typeof KEYED_PROVIDERS)[number] | "openai-compatible"

/** What a key's row says it is: "Claude", or an address's own name. */
function keyName(key: AiKey) {
  return key.provider === "openai-compatible"
    ? (key.name ?? key.baseUrl ?? "")
    : PROVIDER_NAMES[key.provider]
}

/**
 * Keys and addresses, each with Test and Take off, and Add a key. The
 * server admin's and a household's look the same.
 */
export function AiKeys({
  keys,
  canAddKeys,
  canAddAddresses,
  onAdd,
  onRemove,
  onTest,
}: {
  keys: AiKey[]
  canAddKeys: boolean
  canAddAddresses: boolean
  onAdd: (key: NewAiKey) => Promise<void>
  onRemove: (key: AiKey) => Promise<void>
  onTest: (key: AiKey) => Promise<void>
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(id: string, work: () => Promise<void>) {
    setBusy(id)
    try {
      await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3">
      {keys.length > 0 && (
        <ul className="divide-y rounded-2xl border">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {keyName(key)}
                  {key.fromEnvironment && (
                    <Badge variant="secondary">
                      {t("ai.keys.fromEnvironment")}
                    </Badge>
                  )}
                  {key.unreadable && (
                    <Badge variant="destructive">
                      {t("ai.keys.unreadable")}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {[
                    key.provider === "openai-compatible" && key.baseUrl,
                    key.hint && t("ai.keys.endsIn", { hint: key.hint }),
                    key.provider === "openai-compatible" &&
                      t("ai.keys.models", { count: key.models?.length ?? 0 }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(key.id, async () => {
                      await onTest(key)
                      toast.success(t("ai.keys.works", { name: keyName(key) }))
                    })
                  }
                >
                  {busy === key.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon
                      icon={RefreshIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                  )}
                  {t("ai.keys.test")}
                </Button>
                {!key.fromEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("ai.keys.remove", { name: keyName(key) })}
                    disabled={busy !== null}
                    onClick={() => void run(key.id, () => onRemove(key))}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(canAddKeys || canAddAddresses) && (
        <div>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("ai.keys.add")}
          </Button>
        </div>
      )}
      <AddKeyDialog
        open={adding}
        onOpenChange={setAdding}
        canAddKeys={canAddKeys}
        canAddAddresses={canAddAddresses}
        onAdd={onAdd}
      />
    </div>
  )
}

function AddKeyDialog({
  open,
  onOpenChange,
  canAddKeys,
  canAddAddresses,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canAddKeys: boolean
  canAddAddresses: boolean
  onAdd: (key: NewAiKey) => Promise<void>
}) {
  const { t } = useTranslation()
  const choices: Choice[] = [
    ...(canAddKeys ? KEYED_PROVIDERS : []),
    ...(canAddAddresses ? (["openai-compatible"] as const) : []),
  ]
  const [provider, setProvider] = React.useState<Choice>(
    choices[0] ?? "anthropic"
  )
  const [key, setKey] = React.useState("")
  const [name, setName] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const address = provider === "openai-compatible"
  const items = choices.map((choice) => ({
    value: choice,
    label:
      choice === "openai-compatible"
        ? t("ai.keys.address")
        : PROVIDER_NAMES[choice],
  }))

  function reset() {
    setKey("")
    setName("")
    setBaseUrl("")
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onAdd(
        address
          ? { provider, name, baseUrl, key: key || null }
          : { provider, key }
      )
      toast.success(t("ai.keys.added"))
      reset()
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void save(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("ai.keys.addTitle")}</DialogTitle>
            <DialogDescription>{t("ai.keys.addHint")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-provider`}>
                {t("ai.keys.provider")}
              </FieldLabel>
              <Select
                items={items}
                value={provider}
                onValueChange={(next) => {
                  if (next) setProvider(next as Choice)
                }}
              >
                <SelectTrigger id={`${id}-provider`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {address && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-name`}>
                    {t("ai.keys.name")}
                  </FieldLabel>
                  <Input
                    id={`${id}-name`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("ai.keys.namePlaceholder")}
                    maxLength={60}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-url`}>
                    {t("ai.keys.baseUrl")}
                  </FieldLabel>
                  <Input
                    id={`${id}-url`}
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="http://192.168.1.20:11434/v1"
                    inputMode="url"
                    required
                  />
                  <FieldDescription>
                    {t("ai.keys.baseUrlHint")}
                  </FieldDescription>
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-key`}>
                {address ? t("ai.keys.keyOptional") : t("ai.keys.key")}
              </FieldLabel>
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required={!address}
              />
              <FieldDescription>{t("ai.keys.keyHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("ai.keys.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("ai.keys.testAndAdd")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
