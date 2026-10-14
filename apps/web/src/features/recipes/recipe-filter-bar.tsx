import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { DIET_NAMES, DIETS, type Diet, type RecipeSummary } from "@mise/shared"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { ManageTagsDialog } from "./manage-tags-dialog"
import {
  countDiets,
  countTags,
  SORTS,
  TIMES,
  type RecipeFilters,
  type RecipeSort,
} from "./recipe-filters"

const timeLabel = (minutes: number) =>
  minutes === 60 ? "Under an hour" : `Under ${minutes} min`

/**
 * Search, diet, tag and time filters, sorting, and the filters in use as
 * chips. `shown` are the recipes after every filter; counts in the menus are
 * among them.
 */
export function RecipeFilterBar({
  filters,
  search,
  onSearch,
  onChange,
  shown,
  total,
}: {
  filters: RecipeFilters
  search: string
  onSearch: (value: string) => void
  onChange: (change: Partial<RecipeFilters>) => void
  shown: RecipeSummary[]
  total: number
}) {
  const [managing, setManaging] = React.useState(false)
  const active =
    filters.tags.length + filters.diets.length + (filters.time ? 1 : 0)

  function toggleDiet(diet: Diet) {
    onChange({
      diets: filters.diets.includes(diet)
        ? filters.diets.filter((d) => d !== diet)
        : [...filters.diets, diet],
    })
  }

  function toggleTag(tag: string) {
    const selected = filters.tags.some(
      (t) => t.toLowerCase() === tag.toLowerCase()
    )
    onChange({
      tags: selected
        ? filters.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...filters.tags, tag],
    })
  }

  return (
    <div className="mb-6 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1 basis-64 md:max-w-md">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search recipes, ingredients or tags"
            aria-label="Search recipes"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => onSearch("")}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex flex-wrap items-center gap-2">
          <DietMenu
            selected={filters.diets}
            counts={countDiets(shown)}
            onToggle={toggleDiet}
          />
          <TagMenu
            selected={filters.tags}
            shown={shown}
            onToggle={toggleTag}
            onManage={() => setManaging(true)}
          />
          <TimeMenu
            value={filters.time}
            onChange={(time) => onChange({ time })}
          />
          <SortMenu
            value={filters.sort}
            onChange={(sort) => onChange({ sort })}
          />
        </div>
      </div>

      {(active > 0 || filters.q) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {active ? `${shown.length} of ${total}` : shown.length}{" "}
            {(active ? total : shown.length) === 1 ? "recipe" : "recipes"}
          </span>
          {filters.diets.map((diet) => (
            <Chip key={diet} onRemove={() => toggleDiet(diet)}>
              {DIET_NAMES[diet]}
            </Chip>
          ))}
          {filters.tags.map((tag) => (
            <Chip key={tag} onRemove={() => toggleTag(tag)}>
              {tag}
            </Chip>
          ))}
          {filters.time && (
            <Chip onRemove={() => onChange({ time: null })}>
              {timeLabel(filters.time)}
            </Chip>
          )}
          {active > 1 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1"
              onClick={() => onChange({ tags: [], diets: [], time: null })}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      <ManageTagsDialog open={managing} onOpenChange={setManaging} />
    </div>
  )
}

function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-3 text-secondary-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="flex size-5 items-center justify-center rounded-full hover:bg-foreground/10"
        aria-label={`Remove ${typeof children === "string" ? children : "filter"}`}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
      </button>
    </span>
  )
}

/** A filter menu's button: its name, and how many are picked. */
function MenuButton({
  label,
  picked,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; picked?: number }) {
  return (
    <Button
      variant="outline"
      className={cn(picked && "border-primary/50 bg-primary/5")}
      {...props}
    >
      {label}
      {picked ? (
        <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
          {picked}
        </span>
      ) : null}
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2}
        data-icon="inline-end"
        className="text-muted-foreground"
      />
    </Button>
  )
}

function DietMenu({
  selected,
  counts,
  onToggle,
}: {
  selected: Diet[]
  counts: Record<Diet, number>
  onToggle: (diet: Diet) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton label="Diet" picked={selected.length} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {DIETS.map((diet) => (
          <DropdownMenuCheckboxItem
            key={diet}
            checked={selected.includes(diet)}
            disabled={!counts[diet] && !selected.includes(diet)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(diet)}
          >
            {DIET_NAMES[diet]}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {counts[diet]}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Worked out from the ingredients. Check packaging if it matters.
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TagMenu({
  selected,
  shown,
  onToggle,
  onManage,
}: {
  selected: string[]
  shown: RecipeSummary[]
  onToggle: (tag: string) => void
  onManage: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const picked = new Set(selected.map((t) => t.toLowerCase()))
  const counts = countTags(shown)
  // Picked tags first, then the rest by how many recipes have them.
  const tags = [
    ...selected
      .filter(
        (t) => !counts.some((c) => c.name.toLowerCase() === t.toLowerCase())
      )
      .map((name) => ({ name, count: 0 })),
    ...counts,
  ].sort(
    (a, b) =>
      Number(picked.has(b.name.toLowerCase())) -
      Number(picked.has(a.name.toLowerCase()))
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <MenuButton label="Tags" picked={selected.length} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Find a tag" />
          <CommandList className="max-h-72">
            <CommandEmpty>No tags match.</CommandEmpty>
            {tags.map((tag) => {
              const on = picked.has(tag.name.toLowerCase())
              return (
                <CommandItem
                  key={tag.name.toLowerCase()}
                  value={tag.name}
                  onSelect={() => onToggle(tag.name)}
                >
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className={cn("size-4", !on && "invisible")}
                  />
                  <span className="truncate">{tag.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {tag.count}
                  </span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            Rename, merge or delete tags…
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TimeMenu({
  value,
  onChange,
}: {
  value: number | null
  onChange: (time: number | null) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton
          label={value ? timeLabel(value) : "Time"}
          picked={undefined}
          className={cn(value && "border-primary/50 bg-primary/5")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup
          value={String(value ?? "")}
          onValueChange={(next) => onChange(next ? Number(next) : null)}
        >
          <DropdownMenuRadioItem value="">Any time</DropdownMenuRadioItem>
          {TIMES.map((minutes) => (
            <DropdownMenuRadioItem key={minutes} value={String(minutes)}>
              {timeLabel(minutes)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SortMenu({
  value,
  onChange,
}: {
  value: RecipeSort
  onChange: (sort: RecipeSort) => void
}) {
  const label = SORTS.find((s) => s.id === value)!.label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`Sort: ${label}`}>
          <span className="text-muted-foreground">Sort:</span> {label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as RecipeSort)}
        >
          {SORTS.map((sort) => (
            <DropdownMenuRadioItem key={sort.id} value={sort.id}>
              {sort.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
