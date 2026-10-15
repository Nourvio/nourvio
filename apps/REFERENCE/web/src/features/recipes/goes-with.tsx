import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  PencilEdit02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { pairedRecipeInput, type Recipe } from "@mise/shared"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  useAddPairings,
  useCreateRecipe,
  usePairings,
  useRecipes,
  useRemovePairing,
  useTags,
} from "./use-recipes"

function failed(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Couldn't save that")
}

const chip =
  "inline-flex h-7 items-center gap-1 rounded-full px-3 text-sm transition-colors"

/**
 * What a recipe goes with, as chips: tap one to see them together. Also what
 * it's offered with ("Pairs with Chicken + Rice"), and a way to change it.
 */
export function GoesWith({
  recipe,
  selected,
  paired,
  onSelect,
}: {
  recipe: Recipe
  /** The slug shown with it, if any. */
  selected: string | null
  /** That recipe, once loaded. */
  paired: Recipe | undefined
  onSelect: (slug: string | null) => void
}) {
  const pairings = usePairings(recipe.id)
  const [managing, setManaging] = React.useState(false)
  const create = useCreateRecipe()
  const navigate = useNavigate()
  const options = pairings.data?.options ?? []
  const pairsWith = pairings.data?.pairsWith ?? []

  function saveAsRecipe() {
    if (!paired) return
    create.mutate(pairedRecipeInput(recipe, paired), {
      onSuccess: (saved) => {
        toast.success(`Saved ${saved.name}`)
        navigate(`/recipes/${saved.slug}`)
      },
      onError: failed,
    })
  }

  if (pairings.isPending) return null
  return (
    <div className="grid gap-2">
      {options.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">Goes with</span>
          {options.map((option) => {
            const on = option.slug === selected
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : option.slug)}
                className={cn(
                  chip,
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                )}
              >
                {on && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                )}
                {option.name}
              </button>
            )
          })}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Change what it goes with"
            onClick={() => setManaging(true)}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add what it goes with, like sauces or sides
        </button>
      )}

      {selected && paired && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            Showing it with{" "}
            <Link
              to={`/recipes/${paired.slug}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {paired.name}
            </Link>
            .
          </span>
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:opacity-50"
            disabled={create.isPending}
            onClick={saveAsRecipe}
          >
            {create.isPending ? "Saving…" : "Save as its own recipe"}
          </button>
        </p>
      )}

      {pairsWith.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">Pairs with</span>
          {pairsWith.map((base) => (
            <Link
              key={base.id}
              to={`/recipes/${base.slug}?with=${recipe.slug}`}
              className={cn(chip, "border bg-background hover:bg-secondary/60")}
            >
              {base.name}
            </Link>
          ))}
        </div>
      )}

      <ResponsiveDialog
        open={managing}
        onOpenChange={setManaging}
        title={`What goes with ${recipe.name}?`}
        description="Pick recipes, or a whole tag so new ones join by themselves."
      >
        {managing && <ManagePairings recipe={recipe} />}
      </ResponsiveDialog>
    </div>
  )
}

/** The rules as they stand, and ways to add to them. */
function ManagePairings({ recipe }: { recipe: Recipe }) {
  const pairings = usePairings(recipe.id)
  const remove = useRemovePairing(recipe.id)
  const rules = pairings.data?.pairings ?? []

  return (
    <div className="grid gap-4">
      {rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rules.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-3 text-sm text-secondary-foreground"
            >
              {rule.kind === "tag" ? (
                <>
                  Any <span className="font-medium">{rule.tag}</span>
                </>
              ) : (
                rule.recipe.name
              )}
              <button
                type="button"
                aria-label={`Remove ${rule.kind === "tag" ? `tag ${rule.tag}` : rule.recipe.name}`}
                className="flex size-5 items-center justify-center rounded-full hover:bg-foreground/10"
                disabled={remove.isPending}
                onClick={() => remove.mutate(rule.id, { onError: failed })}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </button>
            </span>
          ))}
        </div>
      )}
      <Tabs defaultValue="recipes">
        <TabsList className="w-full">
          <TabsTrigger value="recipes">Pick recipes</TabsTrigger>
          <TabsTrigger value="tag">Use a tag</TabsTrigger>
        </TabsList>
        <TabsContent value="recipes">
          <PickRecipes recipe={recipe} />
        </TabsContent>
        <TabsContent value="tag">
          <PickTag recipe={recipe} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Tags that usually mean "goes with something", offered first. */
const COMPANION =
  /sauce|side|dressing|salsa|dip|marinade|salad|bread|condiment/i

function PickRecipes({ recipe }: { recipe: Recipe }) {
  const recipes = useRecipes({})
  const tags = useTags()
  const pairings = usePairings(recipe.id)
  const add = useAddPairings(recipe.id)
  const [find, setFind] = React.useState("")
  const [tag, setTag] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())

  const already = new Set(
    (pairings.data?.pairings ?? []).flatMap((p) =>
      p.kind === "recipe" ? [p.recipe.id] : []
    )
  )
  const quickTags = [...(tags.data ?? [])]
    .sort(
      (a, b) =>
        Number(COMPANION.test(b.name)) - Number(COMPANION.test(a.name)) ||
        b.count - a.count
    )
    .slice(0, 8)
  const shown = (recipes.data ?? []).filter(
    (r) =>
      r.id !== recipe.id &&
      !already.has(r.id) &&
      (!tag || r.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) &&
      r.name.toLowerCase().includes(find.trim().toLowerCase())
  )

  return (
    <div className="grid gap-3 pt-2">
      {quickTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickTags.map((t) => (
            <button
              key={t.name}
              type="button"
              aria-pressed={tag === t.name}
              onClick={() => setTag(tag === t.name ? null : t.name)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                tag === t.name
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Find a recipe"
          aria-label="Find a recipe"
          value={find}
          onChange={(event) => setFind(event.target.value)}
        />
      </InputGroup>
      {recipes.isPending ? (
        <Skeleton className="h-32" />
      ) : !shown.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No recipes match.
        </p>
      ) : (
        <ul className="grid max-h-64 grid-cols-1 divide-y overflow-x-hidden overflow-y-auto rounded-xl border">
          {shown.map((r) => {
            const on = picked.has(r.id)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
                  onClick={() =>
                    setPicked((current) => {
                      const next = new Set(current)
                      if (on) next.delete(r.id)
                      else next.add(r.id)
                      return next
                    })
                  }
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      on && "border-primary bg-primary text-primary-foreground"
                    )}
                  >
                    {on && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.tags[0] && (
                    <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                      {r.tags.slice(0, 2).join(", ")}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <Button
        disabled={!picked.size || add.isPending}
        onClick={() =>
          add.mutate(
            { recipes: [...picked] },
            {
              onSuccess: () => {
                toast.success(
                  `Added ${picked.size} ${picked.size === 1 ? "recipe" : "recipes"}`
                )
                setPicked(new Set())
              },
              onError: failed,
            }
          )
        }
      >
        {add.isPending && <Spinner data-icon="inline-start" />}
        {picked.size
          ? `Add ${picked.size} ${picked.size === 1 ? "recipe" : "recipes"}`
          : "Pick some recipes"}
      </Button>
    </div>
  )
}

function PickTag({ recipe }: { recipe: Recipe }) {
  const tags = useTags()
  const pairings = usePairings(recipe.id)
  const add = useAddPairings(recipe.id)
  const linked = new Set(
    (pairings.data?.pairings ?? []).flatMap((p) =>
      p.kind === "tag" ? [p.tag.toLowerCase()] : []
    )
  )
  const shown = [...(tags.data ?? [])].sort(
    (a, b) =>
      Number(COMPANION.test(b.name)) - Number(COMPANION.test(a.name)) ||
      b.count - a.count
  )

  if (tags.isPending) return <Skeleton className="mt-2 h-32" />
  if (!shown.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No tags yet. Tag your sauces "sauce" to pair them all at once.
      </p>
    )
  }
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-sm text-muted-foreground">
        Every recipe with the tag goes with {recipe.name}, including ones added
        later.
      </p>
      <ul className="grid max-h-64 grid-cols-1 divide-y overflow-x-hidden overflow-y-auto rounded-xl border">
        {shown.map((t) => {
          const on = linked.has(t.name.toLowerCase())
          return (
            <li key={t.name}>
              <button
                type="button"
                disabled={on || add.isPending}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 disabled:opacity-60"
                onClick={() =>
                  add.mutate(
                    { tag: t.name },
                    {
                      onSuccess: () =>
                        toast.success(`Any ${t.name} goes with ${recipe.name}`),
                      onError: failed,
                    }
                  )
                }
              >
                <span className="min-w-0 flex-1 truncate">
                  Any <span className="font-medium">{t.name}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {on
                    ? "Added"
                    : `${t.count} ${t.count === 1 ? "recipe" : "recipes"}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
