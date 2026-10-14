import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CookingPotIcon,
  Delete02Icon,
  HistoryIcon,
  LeafIcon,
  ImageAdd01Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { Nutrition, Recipe } from "@mise/shared"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { NotFoundPage } from "@/app/not-found-page"
import { useChatScreen } from "@/features/chat/chat-provider"
import { AddToPlanButton } from "@/features/plan/add-to-plan-dialog"
import { useAiStatus } from "@/features/settings/use-ai"
import { ApiError } from "@/lib/api"

import { DietBadges, DietDialog } from "./diet-labels"
import { formatMinutes, formatRelativeDate } from "./format"
import { groupBySection, IngredientList } from "./ingredient-list"
import { RatingStars } from "./rating-stars"
import { RecipeImage } from "./recipe-image"
import { ServingsStepper } from "./servings-stepper"
import { TidyUpDialog } from "./tidy-up-dialog"
import { UnitToggle } from "./unit-toggle"
import { useRecipeProposal } from "./use-cleanup"
import {
  useDeleteRecipe,
  useMarkMade,
  useRateRecipe,
  useRecipe,
  useRecipePhoto,
  useWorkOutNutrition,
} from "./use-recipes"
import { VersionsDialog } from "./versions-dialog"

export function RecipePage() {
  const { slug = "" } = useParams()
  const recipe = useRecipe(slug)

  if (recipe.isPending) return <RecipeSkeleton />
  if (recipe.error instanceof ApiError && recipe.error.status === 404) {
    return <NotFoundPage />
  }
  if (recipe.isError) {
    return (
      <p className="py-10 text-muted-foreground">Couldn't load this recipe.</p>
    )
  }
  return <RecipeView recipe={recipe.data} />
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const [factor, setFactor] = React.useState(1)
  useChatScreen({
    kind: "recipe",
    recipeId: recipe.id,
    recipeName: recipe.name,
    scale: factor,
  })
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const rate = useRateRecipe(recipe.id)
  const markMade = useMarkMade(recipe.id)
  const proposal = useRecipeProposal(recipe.id)
  const [tidying, setTidying] = React.useState(false)
  const [editingDiets, setEditingDiets] = React.useState(false)

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const times = [
    ["Prep", formatMinutes(recipe.prepMinutes)],
    ["Cook", formatMinutes(recipe.cookMinutes)],
    ["Total", formatMinutes(recipe.totalMinutes)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  const cookLink = `/recipes/${recipe.slug}/cook${factor === 1 ? "" : `?scale=${factor}`}`

  return (
    <article className="grid gap-8 pt-2 pb-6">
      <Link
        to="/recipes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4"
        />
        Recipes
      </Link>

      {proposal.data && (
        <Alert>
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
          <AlertTitle>Tidy-up suggestions are ready</AlertTitle>
          <AlertDescription>{proposal.data.summary}</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={() => setTidying(true)}>
              Review
            </Button>
          </AlertAction>
        </Alert>
      )}
      <TidyUpDialog
        recipe={recipe}
        pending={proposal.data}
        open={tidying}
        onOpenChange={setTidying}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <RecipeImage
          src={recipe.imageUrl}
          alt={recipe.name}
          eager
          className="aspect-[4/3] w-full rounded-3xl"
        />
        <div className="grid content-start gap-4">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            {recipe.name}
          </h1>
          {recipe.description && (
            <p className="text-lg text-muted-foreground">
              {recipe.description}
            </p>
          )}
          {(times.length > 0 || recipe.yieldText) && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {times.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
              {recipe.yieldText && (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Makes
                  </dt>
                  <dd className="font-medium">{recipe.yieldText}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <RatingStars
              value={recipe.rating}
              size="md"
              onChange={(rating) => rate.mutate(rating)}
            />
            {recipe.lastMadeAt && (
              <span className="text-sm text-muted-foreground">
                Last made {formatRelativeDate(recipe.lastMadeAt)}
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <Badge key={tag} variant="secondary" asChild>
                  <Link to={`/recipes?tag=${encodeURIComponent(tag)}`}>
                    {tag}
                  </Link>
                </Badge>
              ))}
            </div>
          )}
          <DietBadges recipe={recipe} onEdit={() => setEditingDiets(true)} />
          <DietDialog
            recipe={recipe}
            open={editingDiets}
            onOpenChange={setEditingDiets}
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="lg" asChild>
              <Link to={cookLink}>
                <HugeiconsIcon
                  icon={CookingPotIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Start cooking
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={markMade.isPending}
              onClick={() =>
                markMade.mutate(undefined, {
                  onSuccess: () => toast.success("Marked as made today"),
                })
              }
            >
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Made it
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to={`/recipes/${recipe.slug}/edit`}>
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Edit
              </Link>
            </Button>
            <AddToPlanButton recipe={recipe} factor={factor} />
            <MoreMenu
              recipe={recipe}
              onTidyUp={() => setTidying(true)}
              onDiets={() => setEditingDiets(true)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl font-semibold">Ingredients</CardTitle>
            <ServingsStepper
              baseServings={recipe.servings}
              factor={factor}
              onChange={setFactor}
            />
            <UnitToggle ingredients={recipe.ingredients} className="w-full" />
          </CardHeader>
          <CardContent>
            <IngredientList
              ingredients={recipe.ingredients}
              factor={factor}
              checked={checked}
              onToggle={toggle}
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <h2 className="text-2xl font-semibold">Steps</h2>
            {recipe.steps.length === 0 ? (
              <p className="text-muted-foreground">No steps yet.</p>
            ) : (
              groupBySection(recipe.steps).map((group, groupIndex) => (
                <div
                  key={`${group.section}-${groupIndex}`}
                  className="grid gap-4"
                >
                  {group.section && (
                    <h3 className="text-lg font-semibold">{group.section}</h3>
                  )}
                  <ol className="grid gap-5">
                    {group.items.map((step) => {
                      const number = recipe.steps.indexOf(step) + 1
                      return (
                        <li key={step.id} className="flex gap-4">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                            {number}
                          </span>
                          <p className="pt-1 text-lg leading-relaxed">
                            {step.text}
                          </p>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))
            )}
          </section>

          {recipe.notes && (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">Notes</h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {recipe.notes}
              </p>
            </section>
          )}

          <NutritionPanel recipe={recipe} />

          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={2}
                className="size-4"
              />
              Original recipe:{" "}
              {new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")}
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function MoreMenu({
  recipe,
  onTidyUp,
  onDiets,
}: {
  recipe: Recipe
  onTidyUp: () => void
  onDiets: () => void
}) {
  const navigate = useNavigate()
  const ai = useAiStatus()
  const photo = useRecipePhoto(recipe.id)
  const deleteRecipe = useDeleteRecipe()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const pending = toast.loading("Uploading photo")
    photo.upload.mutate(file, {
      onSuccess: () => toast.success("Photo updated", { id: pending }),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Upload failed",
          {
            id: pending,
          }
        ),
    })
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-lg" variant="outline" aria-label="More actions">
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
            <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} />
            {recipe.imageUrl ? "Change photo" : "Add a photo"}
          </DropdownMenuItem>
          {recipe.imageUrl && (
            <DropdownMenuItem onSelect={() => photo.remove.mutate()}>
              Remove photo
            </DropdownMenuItem>
          )}
          {ai.data?.available && (
            <DropdownMenuItem onSelect={onTidyUp}>
              <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
              Tidy up
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onDiets}>
            <HugeiconsIcon icon={LeafIcon} strokeWidth={2} />
            Diet labels
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <HugeiconsIcon icon={HistoryIcon} strokeWidth={2} />
            History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete recipe
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VersionsDialog
        recipeId={recipe.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {recipe.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the recipe, its photo and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleteRecipe.mutate(recipe.id, {
                  onSuccess: () => {
                    toast.success(`Deleted ${recipe.name}`)
                    navigate("/recipes", { replace: true })
                  },
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const NUTRIENTS: [keyof Nutrition, string, string][] = [
  ["calories", "Calories", ""],
  ["protein", "Protein", "g"],
  ["carbohydrates", "Carbs", "g"],
  ["fat", "Fat", "g"],
  ["fiber", "Fiber", "g"],
  ["sugar", "Sugar", "g"],
  ["sodium", "Sodium", "mg"],
]

const NUTRITION_SOURCE: Record<Nutrition["source"], string> = {
  site: "From the recipe site",
  calculated: "Calculated from the ingredients",
  estimate: "AI estimate",
}

/**
 * Per-serving nutrition and where it's from. Without any, a button works it
 * out (when the server has a USDA or AI key).
 */
function NutritionPanel({ recipe }: { recipe: Recipe }) {
  const ai = useAiStatus()
  const workOut = useWorkOutNutrition(recipe.id)
  const { nutrition } = recipe
  const can = Boolean(ai.data?.usda || ai.data?.available)
  const rows = NUTRIENTS.filter(([key]) => nutrition && nutrition[key] !== null)

  function run() {
    workOut.mutate(undefined, {
      onError: (error) =>
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Couldn't work out the nutrition"
        ),
    })
  }

  if (!nutrition || !rows.length) {
    if (!can) return null
    return (
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Nutrition</h2>
        {recipe.servings ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={workOut.isPending}
              onClick={run}
            >
              {workOut.isPending && <Spinner data-icon="inline-start" />}
              {workOut.isPending ? "Working it out…" : "Work out nutrition"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {ai.data?.usda
                ? "Per serving, from USDA data."
                : "Per serving, as an AI estimate."}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add how many servings it makes to work out nutrition.
          </p>
        )}
      </section>
    )
  }

  const notCounted = nutrition.notCounted ?? []
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Nutrition</h2>
        <span className="text-xs text-muted-foreground">
          Per serving · {NUTRITION_SOURCE[nutrition.source]}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {rows.map(([key, label, unit]) => (
          <div key={key} className="rounded-2xl bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">
              {Math.round(nutrition[key] as number)}
              {unit && <span className="text-sm font-normal"> {unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {(notCounted.length > 0 || (nutrition.source !== "site" && can)) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {notCounted.length > 0 ? (
            <span>Not counted: {notCounted.join("; ")}</span>
          ) : (
            <span />
          )}
          {nutrition.source !== "site" && can && (
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:opacity-50"
              disabled={workOut.isPending}
              onClick={run}
            >
              {workOut.isPending ? "Working it out…" : "Work it out again"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function RecipeSkeleton() {
  return (
    <div className="grid gap-6 pt-8 lg:grid-cols-2">
      <Skeleton className="aspect-[4/3] rounded-3xl" />
      <div className="grid content-start gap-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    </div>
  )
}
