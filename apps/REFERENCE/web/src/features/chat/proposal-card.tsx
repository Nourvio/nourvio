import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  describeAvoided,
  DIET_NAMES,
  MEAL_NAMES,
  RECIPE_SECTION_NAMES,
  RECIPE_SECTIONS,
  type Proposal,
} from "@mise/shared"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { shortDayName } from "@/features/plan/dates"
import { formatMinutes } from "@/features/recipes/format"
import { SectionDiff } from "@/features/recipes/proposal-review"
import {
  useApplyProposal,
  useDismissProposal,
} from "@/features/recipes/use-cleanup"
import { useIsMobile } from "@/hooks/use-mobile"
import { ApiError } from "@/lib/api"

import { useChat } from "./chat-provider"

const KIND_LABELS: Record<Proposal["kind"], string> = {
  new_recipe: "New recipe",
  recipe_edit: "Suggested change",
  cleanup: "Tidy-up",
  plan_meals: "Meal plan",
  list_items: "Shopping list",
  tastes: "Remember",
  import_link: "From the web",
}

/** Something the assistant suggested, with buttons to save or apply it. */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === "tastes") return <TastesCard proposal={proposal} />
  if (proposal.kind === "import_link") return <LinkCard proposal={proposal} />
  return proposal.kind === "plan_meals" || proposal.kind === "list_items" ? (
    <AddCard proposal={proposal} />
  ) : (
    <RecipeCard proposal={proposal} />
  )
}

/** A recipe found on the web, imported into the library with one tap. */
function LinkCard({ proposal }: { proposal: Proposal }) {
  const chat = useChat()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const busy = apply.isPending || dismiss.isPending
  const link = proposal.link
  if (!link) return null

  function open(slug: string) {
    if (isMobile) chat.setOpen(false)
    navigate(`/recipes/${slug}`)
  }

  if (proposal.status !== "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {proposal.status === "applied" && proposal.result ? (
          <>
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 truncate">
              Imported{" "}
              <Link
                to={`/recipes/${proposal.result.slug}`}
                onClick={(event) => {
                  event.preventDefault()
                  open(proposal.result!.slug)
                }}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {proposal.result.name}
              </Link>
            </span>
          </>
        ) : (
          <span className="min-w-0 truncate">Not imported: {link.title}</span>
        )}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-card p-3.5 text-card-foreground shadow-xs">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABELS.import_link}</Badge>
          <span className="text-sm text-muted-foreground">{link.site}</span>
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline-offset-4 hover:underline"
        >
          {link.title}
        </a>
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            apply.mutate(
              { proposal },
              {
                onSuccess: ({ proposal: updated, recipe }) => {
                  chat.updateProposal(updated)
                  if (recipe) {
                    toast.success(`Imported ${recipe.name}`, {
                      action: {
                        label: "Open",
                        onClick: () => open(recipe.slug),
                      },
                    })
                  }
                },
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : "Couldn't import that"
                  ),
              }
            )
          }
        >
          {apply.isPending && <Spinner data-icon="inline-start" />}
          Import
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={link.url} target="_blank" rel="noreferrer">
            Open the page
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(proposal, {
              onSuccess: (updated) => chat.updateProposal(updated),
            })
          }
        >
          No thanks
        </Button>
      </div>
    </div>
  )
}

/** Something for the household to remember: a food to avoid, a diet, a note. */
function TastesCard({ proposal }: { proposal: Proposal }) {
  const chat = useChat()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const busy = apply.isPending || dismiss.isPending
  const tastes = proposal.tastes ?? {}
  const lines = [
    ...(tastes.avoid ?? []).map(describeAvoided),
    ...(tastes.diets?.length
      ? [
          `Every meal ${tastes.diets.map((d) => DIET_NAMES[d].toLowerCase()).join(" and ")}`,
        ]
      : []),
    ...(tastes.weeknightMinutes
      ? [`Weeknight dinners in ${tastes.weeknightMinutes} minutes or less`]
      : []),
    ...(tastes.notes ?? []),
  ]

  function open() {
    if (isMobile) chat.setOpen(false)
    navigate("/settings#tastes")
  }

  if (proposal.status !== "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {proposal.status === "applied" ? (
          <>
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 truncate">
              Remembered in{" "}
              <Link
                to="/settings#tastes"
                onClick={(event) => {
                  event.preventDefault()
                  open()
                }}
                className="font-medium text-foreground underline underline-offset-4"
              >
                tastes and rules
              </Link>
            </span>
          </>
        ) : (
          <span>Not remembered</span>
        )}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-card p-3.5 text-card-foreground shadow-xs">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABELS.tastes}</Badge>
          <span className="font-medium">For the household</span>
        </div>
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
      </div>
      <ul className="grid list-disc gap-1 pl-5 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            apply.mutate(
              { proposal },
              {
                onSuccess: ({ proposal: updated }) => {
                  chat.updateProposal(updated)
                  toast.success("Remembered", {
                    description:
                      "Fill the week and the assistant will follow it.",
                  })
                },
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : "Couldn't remember that"
                  ),
              }
            )
          }
        >
          {apply.isPending && <Spinner data-icon="inline-start" />}
          Remember
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(proposal, {
              onSuccess: (updated) => chat.updateProposal(updated),
            })
          }
        >
          No thanks
        </Button>
      </div>
    </div>
  )
}

/** A new recipe or a change to one. */
function RecipeCard({ proposal }: { proposal: Proposal }) {
  const chat = useChat()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const [expanded, setExpanded] = React.useState(false)
  const busy = apply.isPending || dismiss.isPending
  const sections = RECIPE_SECTIONS.filter((s) => s in proposal.after)

  /** Opening a recipe from the phone drawer closes the drawer. */
  function openRecipe(slug: string) {
    if (isMobile) chat.setOpen(false)
    navigate(`/recipes/${slug}`)
  }

  function onError(error: unknown) {
    toast.error(
      error instanceof ApiError ? error.message : "Couldn't save that"
    )
  }

  function save(asNew?: boolean) {
    apply.mutate(
      {
        proposal,
        sections: proposal.kind === "new_recipe" ? undefined : sections,
        asNew,
      },
      {
        onSuccess: ({ recipe, proposal: updated }) => {
          chat.updateProposal(updated)
          if (!recipe) return
          toast.success(
            proposal.kind === "new_recipe" || asNew
              ? `Saved ${recipe.name}`
              : `Updated ${recipe.name}`,
            {
              action: { label: "Open", onClick: () => openRecipe(recipe.slug) },
            }
          )
        },
        onError,
      }
    )
  }

  const title =
    proposal.kind === "new_recipe"
      ? (proposal.draft?.name ?? "Recipe")
      : (proposal.recipe?.name ?? "A recipe")

  if (proposal.status !== "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {proposal.status === "applied" ? (
          <>
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 truncate">
              {proposal.result && proposal.result.id !== proposal.recipe?.id
                ? "Saved "
                : "Applied to "}
              {proposal.result ? (
                <Link
                  to={`/recipes/${proposal.result.slug}`}
                  onClick={(event) => {
                    event.preventDefault()
                    openRecipe(proposal.result!.slug)
                  }}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {proposal.result.name}
                </Link>
              ) : (
                title
              )}
            </span>
          </>
        ) : (
          <span>Dismissed: {title}</span>
        )}
      </div>
    )
  }

  const draft = proposal.draft
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-card p-3.5 text-card-foreground shadow-xs">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABELS[proposal.kind]}</Badge>
          <span className="font-medium">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
        {draft && (
          <p className="text-xs text-muted-foreground">
            {[
              draft.servings && `${draft.servings} servings`,
              (draft.totalMinutes || draft.cookMinutes) &&
                formatMinutes(draft.totalMinutes ?? draft.cookMinutes ?? null),
              `${draft.ingredients?.filter((l) => !l.startsWith("#")).length ?? 0} ingredients`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <button
        type="button"
        className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : draft ? "Show the recipe" : "Show the changes"}
        <HugeiconsIcon
          icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
          strokeWidth={2}
          className="size-4"
        />
      </button>

      {expanded &&
        (draft ? (
          <div className="grid gap-3 text-sm">
            <ul className="grid gap-1">
              {(draft.ingredients ?? []).map((line, i) =>
                line.startsWith("#") ? (
                  <li key={i} className="pt-1 font-medium">
                    {line.replace(/^#+\s*/, "")}
                  </li>
                ) : (
                  <li key={i}>{line}</li>
                )
              )}
            </ul>
            <ol className="ml-5 grid list-decimal gap-1.5">
              {(draft.steps ?? [])
                .filter((line) => !line.startsWith("#"))
                .map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
            </ol>
          </div>
        ) : (
          <div className="grid gap-3">
            {sections.map((section) => (
              <div key={section} className="grid gap-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {RECIPE_SECTION_NAMES[section]}
                </p>
                <SectionDiff proposal={proposal} section={section} />
              </div>
            ))}
          </div>
        ))}

      <div className="flex flex-wrap gap-2">
        {proposal.kind === "new_recipe" ? (
          <Button size="sm" disabled={busy} onClick={() => save()}>
            {apply.isPending && <Spinner data-icon="inline-start" />}
            Save recipe
          </Button>
        ) : proposal.kind === "recipe_edit" && proposal.variantName ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => save(true)}>
              {apply.isPending && <Spinner data-icon="inline-start" />}
              Save as new recipe
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => save(false)}
            >
              Change the original
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={() => save(false)}>
              {apply.isPending && <Spinner data-icon="inline-start" />}
              {proposal.kind === "cleanup" ? "Apply all" : "Apply to recipe"}
            </Button>
            {proposal.kind === "recipe_edit" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => save(true)}
              >
                Save as a copy
              </Button>
            )}
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(proposal, {
              onSuccess: (updated) => chat.updateProposal(updated),
              onError,
            })
          }
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}

/** Meals for the plan or items for the list, added with one tap. */
function AddCard({ proposal }: { proposal: Proposal }) {
  const chat = useChat()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const busy = apply.isPending || dismiss.isPending
  const forPlan = proposal.kind === "plan_meals"
  const meals = proposal.meals ?? []
  const items = proposal.items ?? []
  const count = forPlan ? meals.length : items.length
  const what = forPlan
    ? `${count} ${count === 1 ? "meal" : "meals"}`
    : `${count} ${count === 1 ? "item" : "items"}`
  const where = forPlan
    ? `/plan${meals[0] ? `?week=${meals[0].date}` : ""}`
    : "/list"

  function open() {
    if (isMobile) chat.setOpen(false)
    navigate(where)
  }

  function onError(error: unknown) {
    toast.error(
      error instanceof ApiError ? error.message : "Couldn't add those"
    )
  }

  if (proposal.status !== "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {proposal.status === "applied" ? (
          <>
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 truncate">
              Added {what} to the{" "}
              <Link
                to={where}
                onClick={(event) => {
                  event.preventDefault()
                  open()
                }}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {forPlan ? "plan" : "list"}
              </Link>
            </span>
          </>
        ) : (
          <span>Dismissed: {what}</span>
        )}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-card p-3.5 text-card-foreground shadow-xs">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABELS[proposal.kind]}</Badge>
          <span className="font-medium">{what}</span>
        </div>
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
      </div>

      {forPlan ? (
        <ul className="grid gap-1.5 text-sm">
          {meals.map((meal, i) => (
            <li key={i} className="flex min-w-0 gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">
                {shortDayName(meal.date)} · {MEAL_NAMES[meal.meal]}
              </span>
              <span className="min-w-0">
                {meal.recipe?.name ?? meal.note}
                {meal.with && (
                  <span className="text-muted-foreground">
                    {" "}
                    with {meal.with.name}
                  </span>
                )}
                {meal.servings && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {meal.servings} servings
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="ml-5 grid list-disc gap-1 text-sm">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            apply.mutate(
              { proposal },
              {
                onSuccess: ({ proposal: updated }) => {
                  chat.updateProposal(updated)
                  toast.success(
                    `Added ${what} to the ${forPlan ? "plan" : "list"}`,
                    { action: { label: "Open", onClick: open } }
                  )
                },
                onError,
              }
            )
          }
        >
          {apply.isPending && <Spinner data-icon="inline-start" />}
          {forPlan ? "Add to plan" : "Add to list"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(proposal, {
              onSuccess: (updated) => chat.updateProposal(updated),
              onError,
            })
          }
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}
