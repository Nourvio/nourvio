import * as React from "react"
import type { PantryItem } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { SectionSelect } from "@/features/list/list-dialogs"
import { ApiError } from "@/lib/api"

import { useUpdatePantryItem } from "./use-pantry"

/** Change an item's name, amount, use-by date or aisle. */
export function EditPantryDialog({
  item,
  onClose,
  onUsedUp,
}: {
  item: PantryItem | null
  onClose: () => void
  onUsedUp: (item: PantryItem) => void
}) {
  return (
    <ResponsiveDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Edit pantry item"
    >
      {item && (
        <EditPantryItem
          item={item}
          onDone={onClose}
          onUsedUp={() => {
            onUsedUp(item)
            onClose()
          }}
        />
      )}
    </ResponsiveDialog>
  )
}

function EditPantryItem({
  item,
  onDone,
  onUsedUp,
}: {
  item: PantryItem
  onDone: () => void
  onUsedUp: () => void
}) {
  const update = useUpdatePantryItem()
  const [name, setName] = React.useState(item.name)
  const [amount, setAmount] = React.useState(item.amount)
  const [useBy, setUseBy] = React.useState(item.useBy ?? "")
  const [section, setSection] = React.useState(item.sectionId)

  function save(event: React.FormEvent) {
    event.preventDefault()
    update.mutate(
      {
        id: item.id,
        ...(name.trim() && name.trim() !== item.name
          ? { name: name.trim() }
          : {}),
        ...(amount.trim() !== item.amount ? { amount: amount.trim() } : {}),
        ...((useBy || null) !== item.useBy ? { useBy: useBy || null } : {}),
        ...(section !== item.sectionId ? { sectionId: section } : {}),
      },
      {
        onSuccess: onDone,
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  return (
    <form className="grid gap-5" onSubmit={save}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pantry-name">Item</FieldLabel>
          <Input
            id="pantry-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pantry-amount">How much</FieldLabel>
          <Input
            id="pantry-amount"
            placeholder="2 lb, half a bag…"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FieldDescription>
            Leave it empty for just “have it”.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="pantry-use-by">Use by</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="pantry-use-by"
              type="date"
              value={useBy}
              onChange={(e) => setUseBy(e.target.value)}
            />
            {useBy && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setUseBy("")}
              >
                No date
              </Button>
            )}
          </div>
          <FieldDescription>
            Fresh food gets a rough guess. It shows under “Use soon” two days
            ahead.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="pantry-section">Aisle</FieldLabel>
          <SectionSelect
            id="pantry-section"
            value={section}
            onChange={setSection}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={onUsedUp}
        >
          Used up
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </div>
    </form>
  )
}
