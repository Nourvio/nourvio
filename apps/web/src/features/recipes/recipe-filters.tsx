import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { SelectField } from "@/components/form/select-field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Toggle } from "@/components/ui/toggle"

import {
  RECIPE_SORTS,
  searchTags,
  tagsQuery,
  type RecipeSearch,
  type RecipeSort,
} from "./queries"

/** Search, sort and tags for the Recipes page. Changes go into the address. */
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <InputGroup className="h-10">
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
        <div className="sm:w-48">
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
      <div
        role="group"
        aria-label={t("recipes.filters")}
        className="flex flex-wrap gap-2"
      >
        <Toggle
          size="sm"
          variant="outline"
          pressed={Boolean(search.new)}
          onPressedChange={(pressed) =>
            onChange({ ...search, new: pressed ? true : undefined })
          }
          title={t("recipes.notMadeYet")}
          className={CHIP}
        >
          {t("recipes.new")}
        </Toggle>
        {tags.length > 0 && (
          <span aria-hidden className="mx-1 my-1.5 w-px bg-border" />
        )}
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
    </div>
  )
}

/** A filter chip, filled in while it's on. */
const CHIP =
  "rounded-full aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
