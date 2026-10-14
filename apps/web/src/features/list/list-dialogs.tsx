import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import {
  STORE_SECTIONS,
  type ShoppingItem,
  type StoreSectionId,
  type WeeklyItem,
} from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"

import {
  useAddWeeklyItem,
  useAddWeeklyToList,
  useDeleteListItem,
  useDeleteWeeklyItem,
  useSaveOnHand,
  useUpdateListItem,
  useUpdateWeeklyItem,
  useWeeklyItems,
} from "./use-list"

function failed(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Couldn't save that")
}

function SectionSelect({
  id,
  value,
  onChange,
}: {
  id?: string
  value: StoreSectionId
  onChange: (section: StoreSectionId) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as StoreSectionId)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STORE_SECTIONS.map((section) => (
          <SelectItem key={section.id} value={section.id}>
            {section.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Change an item's name, amount or aisle, or take it off the list. */
export function EditItemDialog({
  item,
  onClose,
}: {
  item: ShoppingItem | null
  onClose: () => void
}) {
  return (
    <ResponsiveDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Edit item"
    >
      {item && <EditItem item={item} onDone={onClose} />}
    </ResponsiveDialog>
  )
}

function EditItem({
  item,
  onDone,
}: {
  item: ShoppingItem
  onDone: () => void
}) {
  const update = useUpdateListItem()
  const remove = useDeleteListItem()
  const [name, setName] = React.useState(item.name)
  const [amount, setAmount] = React.useState(item.amount)
  const [section, setSection] = React.useState(item.sectionId)

  function save(event: React.FormEvent) {
    event.preventDefault()
    update.mutate(
      {
        id: item.id,
        ...(name.trim() !== item.name ? { name: name.trim() } : {}),
        ...(amount.trim() !== item.amount ? { amount: amount.trim() } : {}),
        ...(section !== item.sectionId ? { sectionId: section } : {}),
      },
      { onSuccess: onDone, onError: failed }
    )
  }

  return (
    <form className="grid gap-5" onSubmit={save}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="item-name">Item</FieldLabel>
          <Input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-amount">Amount</FieldLabel>
          <Input
            id="item-amount"
            placeholder="2 lb, 1 bag…"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-section">Aisle</FieldLabel>
          <SectionSelect
            id="item-section"
            value={section}
            onChange={setSection}
          />
          <FieldDescription>
            Mise remembers where this goes next time.
          </FieldDescription>
        </Field>
        {item.recipes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            For {item.recipes.join(", ")}
          </p>
        )}
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(item.id, { onSuccess: onDone, onError: failed })
          }
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Remove
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={update.isPending || !name.trim()}
        >
          {update.isPending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </div>
    </form>
  )
}

/** Things bought every week, whatever's planned. */
export function WeeklyItemsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Every week"
      description="Bought every week, whatever's planned. They're added with the plan."
    >
      {open && <WeeklyItems />}
    </ResponsiveDialog>
  )
}

function WeeklyItems() {
  const items = useWeeklyItems()
  const add = useAddWeeklyItem()
  const addToList = useAddWeeklyToList()
  const [name, setName] = React.useState("")
  const [amount, setAmount] = React.useState("")

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    add.mutate(
      { name: name.trim(), amount: amount.trim() || null },
      {
        onSuccess: () => {
          setName("")
          setAmount("")
        },
        onError: failed,
      }
    )
  }

  return (
    <div className="grid gap-4">
      <form className="flex gap-2" onSubmit={submit}>
        <Input
          aria-label="Item"
          placeholder="Diet Pepsi"
          className="flex-[2]"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Amount"
          placeholder="2 × 12-pack"
          className="flex-1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || add.isPending}>
          Add
        </Button>
      </form>
      {items.isPending ? (
        <Skeleton className="h-20" />
      ) : items.data?.length ? (
        <ul className="grid gap-2">
          {items.data.map((item) => (
            <WeeklyRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nothing yet. Add the things you buy every week.
        </p>
      )}
      {!!items.data?.length && (
        <Button
          variant="outline"
          disabled={addToList.isPending}
          onClick={() =>
            addToList.mutate(undefined, {
              onSuccess: ({ added }) =>
                toast.success(
                  added
                    ? `Added ${added} to the list`
                    : "They're all on the list already"
                ),
              onError: failed,
            })
          }
        >
          Add them to the list now
        </Button>
      )}
    </div>
  )
}

function WeeklyRow({ item }: { item: WeeklyItem }) {
  const update = useUpdateWeeklyItem()
  const remove = useDeleteWeeklyItem()
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 rounded-xl border p-2.5">
      <div className="min-w-0">
        <p className="truncate font-medium">{item.name}</p>
        {item.amount && (
          <p className="text-sm text-muted-foreground">{item.amount}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Stop buying ${item.name} every week`}
        disabled={remove.isPending}
        onClick={() => remove.mutate(item.id, { onError: failed })}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
      </Button>
      <div className="col-span-2">
        <SectionSelect
          value={item.sectionId}
          onChange={(sectionId) =>
            update.mutate({ id: item.id, sectionId }, { onError: failed })
          }
        />
      </div>
    </li>
  )
}

/** Things always at home, left off lists made from the plan. */
export function OnHandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Always on hand"
      description="Left off lists made from the plan, like salt and pepper."
    >
      {open && <OnHand />}
    </ResponsiveDialog>
  )
}

function OnHand() {
  const household = useHouseholdInfo()
  const save = useSaveOnHand()
  const [text, setText] = React.useState("")
  const items = household.data?.onHand ?? []

  function set(next: string[]) {
    save.mutate(next, { onError: failed })
  }

  return (
    <div className="grid gap-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const name = text.trim().toLowerCase()
          if (!name) return
          set([...items, name])
          setText("")
        }}
      >
        <Input
          aria-label="Item"
          placeholder="olive oil"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim() || save.isPending}>
          Add
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge
            key={item}
            variant="secondary"
            className="h-8 gap-1 pr-1 pl-3 text-sm"
          >
            {item}
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-full"
              aria-label={`Remove ${item}`}
              onClick={() => set(items.filter((i) => i !== item))}
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  )
}
