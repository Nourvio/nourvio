import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import {
  MAIN_LIST,
  STORE_SECTIONS,
  type ShopId,
  type ShoppingList,
  type StoreSectionId,
} from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  useHouseholdInfo,
  useSaveLists,
} from "@/features/settings/use-household"
import { useShopStatus } from "@/features/shop/use-shop"
import { ApiError } from "@/lib/api"

const MAX_LISTS = 10
const NO_STORE = "none"

/** The household's lists: names, the store each is for, and the aisles that go on it. */
export function ListsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const household = useHouseholdInfo()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Shopping lists"
      description="A list for each store you shop at. Things go on the main list unless their aisle goes elsewhere, or you've moved them before."
    >
      {open && household.data && (
        <ListsEditor
          initial={household.data.lists}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  )
}

function ListsEditor({
  initial,
  onDone,
}: {
  initial: ShoppingList[]
  onDone: () => void
}) {
  const save = useSaveLists()
  const krogerName = useShopStatus().data?.kroger.store?.banner ?? "Kroger"
  const [lists, setLists] = React.useState(initial)
  const stores: { id: ShopId; name: string }[] = [
    { id: "kroger", name: krogerName },
    { id: "costco", name: "Costco" },
    { id: "walmart", name: "Walmart" },
  ]

  const change = (id: string, patch: Partial<ShoppingList>) =>
    setLists((current) =>
      current.map((list) => (list.id === id ? { ...list, ...patch } : list))
    )

  function add() {
    setLists((current) => [
      ...current,
      {
        id: crypto.randomUUID().slice(0, 8),
        name: "",
        store: null,
        sections: [],
      },
    ])
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    save.mutate(
      lists.map((list) => ({ ...list, name: list.name.trim() })),
      {
        onSuccess: () => {
          toast.success("Lists saved")
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Couldn't save the lists"
          ),
      }
    )
  }

  const takenBy = (section: StoreSectionId, id: string) =>
    lists.find((list) => list.id !== id && list.sections.includes(section))

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <ul className="grid gap-4">
        {lists.map((list) => (
          <li key={list.id} className="grid gap-3 rounded-2xl border p-4">
            <div className="flex items-center gap-2">
              <Input
                value={list.name}
                onChange={(event) =>
                  change(list.id, { name: event.target.value })
                }
                placeholder={list.id === MAIN_LIST ? "Groceries" : "Costco"}
                aria-label="List name"
                maxLength={40}
                required
              />
              <Select
                value={list.store ?? NO_STORE}
                onValueChange={(value) =>
                  change(list.id, {
                    store: value === NO_STORE ? null : (value as ShopId),
                  })
                }
              >
                <SelectTrigger className="w-40 shrink-0" aria-label="Store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STORE}>Any store</SelectItem>
                  {stores.map((store) => (
                    <SelectItem
                      key={store.id}
                      value={store.id}
                      disabled={lists.some(
                        (other) =>
                          other.id !== list.id && other.store === store.id
                      )}
                    >
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {list.id !== MAIN_LIST && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${list.name || "this list"}`}
                  onClick={() =>
                    setLists((current) =>
                      current.filter((l) => l.id !== list.id)
                    )
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              )}
            </div>
            {list.id === MAIN_LIST ? (
              <p className="text-sm text-muted-foreground">
                The main list: everything goes here unless an aisle or a move
                says otherwise.
              </p>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  Aisles that go on this list
                </p>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  value={list.sections}
                  onValueChange={(value) =>
                    change(list.id, { sections: value as StoreSectionId[] })
                  }
                  className="flex-wrap justify-start"
                >
                  {STORE_SECTIONS.filter(
                    (section) => section.id !== "other"
                  ).map((section) => {
                    const other = takenBy(section.id, list.id)
                    return (
                      <ToggleGroupItem
                        key={section.id}
                        value={section.id}
                        disabled={Boolean(other)}
                        title={
                          other
                            ? `On ${other.name || "another list"}`
                            : undefined
                        }
                      >
                        {section.name}
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
              </div>
            )}
          </li>
        ))}
      </ul>
      {lists.length < MAX_LISTS && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={add}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add a list
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Moving something to another list (tap it on the list) teaches Nourvio
        where that food goes from then on. Things on a removed list move to the
        main one.
      </p>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending && <Spinner data-icon="inline-start" />}
        Save
      </Button>
    </form>
  )
}
