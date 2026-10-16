import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import {
  everyWeekQuery,
  onHandQuery,
  type Aisle,
  type ListItem,
} from "./queries"
import { useListActions } from "./use-list-actions"

/** No aisle, in a Select: Select values can't be null. */
const NONE = "none"

/** An aisle to pick: the household's, in walking order, or none. */
function AisleSelect({
  id,
  aisles,
  value,
  onChange,
}: {
  id: string
  aisles: readonly Aisle[]
  value: string | null
  onChange: (aisle: string | null) => void
}) {
  const { t } = useTranslation()
  const options = [
    ...aisles.map((aisle) => ({ value: aisle.id, label: aisle.name })),
    { value: NONE, label: t("list.noAisle") },
  ]
  return (
    <Select
      items={options}
      value={value ?? NONE}
      onValueChange={(next) => {
        if (next) onChange(next === NONE ? null : next)
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Changing one thing on the list: its name, how much, and its aisle. */
export function EditItemDialog({
  item,
  aisles,
  onClose,
}: {
  item: ListItem | null
  aisles: readonly Aisle[]
  onClose: () => void
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {item && <EditItem item={item} aisles={aisles} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function EditItem({
  item,
  aisles,
  onDone,
}: {
  item: ListItem
  aisles: readonly Aisle[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const actions = useListActions()
  const [name, setName] = React.useState(item.name)
  const [amount, setAmount] = React.useState(item.amount)
  const [aisle, setAisle] = React.useState(item.aisle)
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    const done = await actions.change(item, {
      ...(name.trim() !== item.name ? { name: name.trim() } : {}),
      ...(amount.trim() !== item.amount ? { amount: amount.trim() } : {}),
      ...(aisle !== item.aisle ? { aisle } : {}),
    })
    setBusy(false)
    if (done) onDone()
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t("list.editItem.title", { name: item.name })}
        </DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="list-item-name">
          {t("list.editItem.name")}
        </FieldLabel>
        <Input
          id="list-item-name"
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="list-item-amount">
          {t("list.editItem.amount")}
        </FieldLabel>
        <Input
          id="list-item-amount"
          value={amount}
          maxLength={60}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldDescription>{t("list.editItem.amountHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="list-item-aisle">
          {t("list.editItem.aisle")}
        </FieldLabel>
        <AisleSelect
          id="list-item-aisle"
          aisles={aisles}
          value={aisle}
          onChange={setAisle}
        />
        <FieldDescription>{t("list.editItem.aisleHint")}</FieldDescription>
      </Field>
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            onDone()
            void actions.remove(item)
          }}
        >
          {t("list.editItem.remove")}
        </Button>
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("list.editItem.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Where selected things go: an aisle, remembered for each food. */
export function AisleDialog({
  count,
  aisles,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  aisles: readonly Aisle[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (aisle: Aisle | null) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("list.aisleDialog.title", { count })}</DialogTitle>
          <DialogDescription>{t("list.aisleDialog.hint")}</DialogDescription>
        </DialogHeader>
        <ul className="-mx-2 grid max-h-[60vh] overflow-y-auto">
          {[...aisles, null].map((aisle) => (
            <li key={aisle?.id ?? NONE}>
              <button
                type="button"
                onClick={() => onPick(aisle)}
                className="w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {aisle?.name ?? t("list.noAisle")}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/** What's bought every week whatever's planned: add and remove. */
export function EveryWeekDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery({ ...everyWeekQuery, enabled: open })
  const [name, setName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      await queryClient.invalidateQueries({ queryKey: everyWeekQuery.queryKey })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.weekly.title")}</DialogTitle>
          <DialogDescription>{t("list.weekly.description")}</DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-24" />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("list.weekly.none")}
          </p>
        ) : (
          <ul className="grid divide-y rounded-2xl border">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 py-1.5 pr-1.5 pl-4"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium first-letter:uppercase">
                    {item.name}
                  </span>
                  {item.amount && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.amount}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={t("list.weekly.remove", { name: item.name })}
                  onClick={() =>
                    void run(() =>
                      unwrap(
                        api.DELETE("/api/list/every-week/{weeklyId}", {
                          params: { path: { weeklyId: item.id } },
                        })
                      )
                    )
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void run(async () => {
              await unwrap(
                api.POST("/api/list/every-week", {
                  body: { name: name.trim(), amount: amount.trim() || null },
                })
              )
              setName("")
              setAmount("")
            })
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("list.weekly.namePlaceholder")}
            aria-label={t("list.weekly.name")}
            maxLength={200}
            className="min-w-36 flex-1"
          />
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("list.weekly.amountPlaceholder")}
            aria-label={t("list.weekly.amount")}
            maxLength={60}
            className="w-28"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !name.trim()}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("list.weekly.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** What the household always has, left off lists made from the plan. */
export function OnHandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery({ ...onHandQuery, enabled: open })
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const items = data?.items ?? []

  async function save(next: string[]) {
    setBusy(true)
    try {
      queryClient.setQueryData(
        onHandQuery.queryKey,
        await unwrap(
          api.PUT("/api/households/current/on-hand", { body: { items: next } })
        )
      )
      toast.success(t("list.onHandDialog.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.onHandDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("list.onHandDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-16" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
              >
                <span className="first-letter:uppercase">{item}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("list.onHandDialog.remove", { name: item })}
                  onClick={() =>
                    void save(items.filter((other) => other !== item))
                  }
                  className="flex size-6 items-center justify-center rounded-full hover:bg-foreground/10"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void save([...items, name.trim()]).then(() => setName(""))
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("list.onHandDialog.placeholder")}
            aria-label={t("list.onHandDialog.label")}
            maxLength={60}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !name.trim()}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("list.onHandDialog.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
