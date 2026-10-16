import {
  ArrowDown01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DIETS, type Diet } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"

import {
  RECIPE_SORTS,
  RECIPE_TIMES,
  searchDiets,
  searchTags,
  tagsQuery,
  type RecipeSearch,
  type RecipeSort,
  type RecipeTime,
} from "./queries"

/**
 * Search, sort, and filters by new, diet, time and tags for the Recipes
 * page. Changes go into the address.
 */
export function RecipeFilters({
  search,
  onChange,
}: {
  search: RecipeSearch
  onChange: (next: RecipeSearch) => void
}) {
  const { t } = useTranslation()
  const { data: tags = [] } = useQuery(tagsQuery)
  const [words, setWords] = React.useState(search.q ?? "")
  const chosen = searchTags(search)

  // Follows the address when it changes some other way, like Clear.
  React.useEffect(
    () =>
      setWords((current) =>
        current.trim() === (search.q ?? "") ? current : (search.q ?? "")
      ),
    [search.q]
  )

  // Searches a moment after typing stops, not on every key.
  React.useEffect(() => {
    if (words.trim() === (search.q ?? "")) return
    const timer = setTimeout(
      () => onChange({ ...search, q: words.trim() || undefined }),
      300
    )
    return () => clearTimeout(timer)
  }, [words, search, onChange])

  const toggleTag = (name: string) => {
    const key = name.toLowerCase()
    const next = chosen.some((tag) => tag.toLowerCase() === key)
      ? chosen.filter((tag) => tag.toLowerCase() !== key)
      : [...chosen, name]
    onChange({ ...search, tags: next.length > 0 ? next.join(",") : undefined })
  }

  const sortOptions = RECIPE_SORTS.map((value) => ({
    value,
    label: t(`recipes.sort.${value}`),
  }))

  return (
    <div className="space-y-4">
      {/* Search, the filters and the sort in one row, wrapping when narrow. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <InputGroup className="h-9">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder={t("recipes.search")}
              aria-label={t("recipes.search")}
            />
            {words && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("recipes.clearSearch")}
                  onClick={() => setWords("")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
        <div
          role="group"
          aria-label={t("recipes.filters")}
          className="flex flex-wrap items-center gap-2"
        >
          <Toggle
            variant="outline"
            pressed={Boolean(search.new)}
            onPressedChange={(pressed) =>
              onChange({ ...search, new: pressed ? true : undefined })
            }
            title={t("recipes.notMadeYet")}
            className={cn(CHIP, "px-4")}
          >
            {t("recipes.new")}
          </Toggle>
          <DietMenu
            picked={searchDiets(search)}
            onChange={(diets) =>
              onChange({
                ...search,
                diets: diets.length > 0 ? diets.join(",") : undefined,
              })
            }
          />
          <TimeMenu
            value={search.time}
            onChange={(time) => onChange({ ...search, time })}
          />
        </div>
        <div className="w-full sm:w-48">
          <SelectField<RecipeSort>
            label={t("recipes.sortBy")}
            value={search.sort ?? "newest"}
            onChange={(sort) =>
              onChange({
                ...search,
                sort: sort === "newest" ? undefined : sort,
              })
            }
            options={sortOptions}
          />
        </div>
      </div>
      {tags.length > 0 && (
        <div
          role="group"
          aria-label={t("recipes.tags")}
          className="flex flex-wrap gap-2"
        >
          {tags.map((tag) => {
            const on = chosen.some(
              (name) => name.toLowerCase() === tag.name.toLowerCase()
            )
            return (
              <Toggle
                key={tag.id}
                size="sm"
                variant="outline"
                pressed={on}
                onPressedChange={() => toggleTag(tag.name)}
                className={CHIP}
              >
                {tag.name}
                <span className="text-xs opacity-70">{tag.recipes}</span>
              </Toggle>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A filter chip, filled in while it's on. */
const CHIP =
  "rounded-full aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"

/** A filter menu's button, filled in like a chip while something's picked. */
function MenuChip({
  label,
  on,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; on: boolean }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "rounded-full px-4",
        on &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
      )}
      {...props}
    >
      {label}
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2}
        data-icon="inline-end"
      />
    </Button>
  )
}

/** Recipes with every diet label picked. */
function DietMenu({
  picked,
  onChange,
}: {
  picked: Diet[]
  onChange: (diets: Diet[]) => void
}) {
  const { t } = useTranslation()
  const label =
    picked.length === 1
      ? t(`recipes.diets.names.${picked[0]!}`)
      : picked.length > 1
        ? `${t("recipes.diets.filter")} · ${picked.length}`
        : t("recipes.diets.filter")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<MenuChip label={label} on={picked.length > 0} />}
      />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("recipes.diets.filter")}</DropdownMenuLabel>
          {DIETS.map((diet) => (
            <DropdownMenuCheckboxItem
              key={diet}
              checked={picked.includes(diet)}
              onCheckedChange={(on) =>
                onChange(
                  DIETS.filter((d) => (d === diet ? on : picked.includes(d)))
                )
              }
            >
              {t(`recipes.diets.names.${diet}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Under 30 min", "Under an hour". */
function useTimeLabel() {
  const { t } = useTranslation()
  return (minutes: RecipeTime) =>
    minutes === 60
      ? t("recipes.timeFilter.hour")
      : t("recipes.timeFilter.under", { minutes })
}

/** Recipes ready in so many minutes or fewer. */
function TimeMenu({
  value,
  onChange,
}: {
  value: RecipeTime | undefined
  onChange: (time: RecipeTime | undefined) => void
}) {
  const { t } = useTranslation()
  const timeLabel = useTimeLabel()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <MenuChip
            label={value ? timeLabel(value) : t("recipes.timeFilter.label")}
            on={Boolean(value)}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("recipes.timeFilter.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(value ?? "")}
            onValueChange={(next) =>
              onChange(next ? (Number(next) as RecipeTime) : undefined)
            }
          >
            <DropdownMenuRadioItem value="">
              {t("recipes.timeFilter.any")}
            </DropdownMenuRadioItem>
            {RECIPE_TIMES.map((minutes) => (
              <DropdownMenuRadioItem key={minutes} value={String(minutes)}>
                {timeLabel(minutes)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
