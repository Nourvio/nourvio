import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Checkbox } from "@/components/ui/checkbox"
import { SelectMark } from "@/features/select/select-mark"
import { useLongPress, type Selection } from "@/features/select/use-selection"
import { cn } from "@/lib/utils"

import type { ListItem } from "./queries"
import { useListActions } from "./use-list-actions"

/**
 * One thing to buy: a box to check it off, its name and how much (tap to
 * change it), what it's for, and on a store's list, finding it on the
 * store's site. A long press starts selecting with it.
 */
export function ItemRow({
  item,
  selection,
  onEdit,
  findAt = null,
}: {
  item: ListItem
  selection: Selection
  onEdit: () => void
  /** Its store's search for it, for a list that's for a store. */
  findAt?: { store: string; url: string } | null
}) {
  const { t } = useTranslation()
  const actions = useListActions()
  const press = useLongPress(
    () => selection.start(item.id),
    !selection.selecting
  )
  const selecting = selection.selecting
  const picked = selection.isPicked(item.id)
  const badges = item.checked
    ? []
    : [
        ...item.meals.map((meal) => ({
          key: meal.id,
          text: t("list.forMeal", { name: meal.name }),
          meal: true,
        })),
        ...(item.source === "every-week"
          ? [{ key: "every-week", text: t("list.everyWeekBadge"), meal: false }]
          : []),
      ]

  const find = item.checked || selecting ? null : findAt

  // A narrow card: what it's for under the name. A wide one: all in a line.
  return (
    <li
      className={cn(
        "grid items-center gap-x-3.5 gap-y-1 py-3 @2xl:gap-x-4",
        find
          ? "grid-cols-[auto_minmax(0,1fr)_auto] @2xl:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
          : "grid-cols-[auto_minmax(0,1fr)] @2xl:grid-cols-[auto_minmax(0,1fr)_auto]"
      )}
    >
      {selecting ? (
        <span
          onClick={() => selection.toggle(item.id)}
          className={cn(
            "col-start-1 row-start-1 cursor-pointer",
            badges.length > 0 && "row-span-2 @2xl:row-span-1"
          )}
        >
          <SelectMark picked={picked} />
        </span>
      ) : (
        <Checkbox
          className={cn(
            "col-start-1 row-start-1 size-6 rounded-md",
            badges.length > 0 && "row-span-2 @2xl:row-span-1"
          )}
          checked={item.checked}
          aria-label={
            item.checked
              ? t("list.uncheck", { name: item.name })
              : t("list.check", { name: item.name })
          }
          onCheckedChange={(on) =>
            void actions.change(item, { checked: on === true })
          }
        />
      )}
      <button
        type="button"
        onClick={selecting ? () => selection.toggle(item.id) : onEdit}
        {...(selecting ? {} : press)}
        aria-pressed={selecting ? picked : undefined}
        aria-label={
          selecting
            ? picked
              ? t("select.unpick", { name: item.name })
              : t("select.pick", { name: item.name })
            : t("list.edit", { name: item.name })
        }
        className={cn(
          "col-start-2 row-start-1 flex min-w-0 items-baseline gap-1.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          item.checked && !selecting && "text-muted-foreground line-through"
        )}
      >
        <span className="truncate font-medium first-letter:uppercase">
          {item.name}
        </span>
        {item.amount && (
          <span className="shrink-0 text-muted-foreground">
            · {item.amount}
          </span>
        )}
      </button>
      {badges.length > 0 && (
        <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 @2xl:col-start-3 @2xl:row-start-1 @2xl:max-w-sm @2xl:justify-end">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={cn(
                "inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
                badge.meal
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
      {find && (
        <a
          href={find.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t("list.findName", {
            name: item.name,
            store: find.store,
          })}
          className="col-start-3 row-start-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 @2xl:col-start-4"
        >
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4"
          />
          <span className="hidden @lg:inline">
            {t("list.find", { store: find.store })}
          </span>
        </a>
      )}
    </li>
  )
}
