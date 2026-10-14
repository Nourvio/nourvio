import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  TextFontIcon,
  Timer02Icon,
} from "@hugeicons/core-free-icons"
import { pairRecipes, type Recipe } from "@mise/shared"
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { NotFoundPage } from "@/app/not-found-page"
import { ChatLauncher } from "@/features/chat/chat-launcher"
import { useChatScreen } from "@/features/chat/chat-provider"
import { useUpdatePlanEntry } from "@/features/plan/use-plan"
import {
  IngredientList,
  IngredientText,
} from "@/features/recipes/ingredient-list"
import { UnitToggle, useUnitMode } from "@/features/recipes/unit-toggle"
import { useMarkMade, useRecipe } from "@/features/recipes/use-recipes"
import { storedChoice } from "@/lib/stored-choice"
import { cn } from "@/lib/utils"

import { ingredientsInStep, splitDurations } from "./step-text"
import { NewTimerButton, startTimer, TimerChips } from "./timers"
import { useWakeLock } from "./use-wake-lock"

type TextSize = "standard" | "large" | "huge"

/** How big the steps are, remembered on this device: big enough to read from the stove. */
const useTextSize = storedChoice<TextSize>(
  "mise.cookText",
  ["standard", "large", "huge"],
  "standard"
)

const STEP_TEXT: Record<TextSize, string> = {
  standard: "text-2xl md:text-3xl lg:text-4xl",
  large: "text-3xl md:text-4xl lg:text-5xl",
  huge: "text-4xl md:text-5xl lg:text-6xl",
}

const DETAIL_TEXT: Record<TextSize, string> = {
  standard: "text-base",
  large: "text-lg",
  huge: "text-xl",
}

export function CookPage() {
  const { slug = "" } = useParams()
  const [params] = useSearchParams()
  const recipe = useRecipe(slug)
  // What it goes with is loaded first, so its steps are counted from the start.
  const withSlug = params.get("with")
  const paired = useRecipe(withSlug ?? "", { enabled: Boolean(withSlug) })

  if (recipe.isPending || (withSlug && paired.isPending)) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (recipe.isError) return <NotFoundPage />
  return <CookView recipe={recipe.data} paired={paired.data ?? null} />
}

type Progress = {
  index: number
  checked: string[]
  with: string | null
  scale: number
  savedAt: number
}

/** Where cooking got to, so leaving (or the phone reloading) doesn't lose it. */
const progressKey = (recipeId: string) => `mise.cooking.${recipeId}`
const PROGRESS_HOURS = 12

function loadProgress(
  recipeId: string,
  withSlug: string | null,
  scale: number
): Progress | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(progressKey(recipeId)) ?? "null"
    ) as Progress | null
    if (
      !saved ||
      saved.with !== withSlug ||
      saved.scale !== scale ||
      Date.now() - saved.savedAt > PROGRESS_HOURS * 3_600_000
    ) {
      return null
    }
    return saved
  } catch {
    return null
  }
}

function saveProgress(recipeId: string, progress: Progress | null) {
  try {
    if (progress) {
      localStorage.setItem(progressKey(recipeId), JSON.stringify(progress))
    } else {
      localStorage.removeItem(progressKey(recipeId))
    }
  } catch {
    // Not remembered; cooking still works.
  }
}

function CookView({
  recipe,
  paired,
}: {
  recipe: Recipe
  /** What it's cooked with, like a sauce it goes with. */
  paired: Recipe | null
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const factor =
    Number(params.get("scale")) > 0 ? Number(params.get("scale")) : 1
  const withSlug = params.get("with")
  // Opened from the plan: finishing marks that meal cooked.
  const entryId = params.get("entry")
  const [resumed] = React.useState(() =>
    loadProgress(recipe.id, withSlug, factor)
  )
  const [index, setIndex] = React.useState(resumed?.index ?? 0)
  const [checked, setChecked] = React.useState<Set<string>>(
    () => new Set(resumed?.checked)
  )
  const [textSize, setTextSize] = useTextSize()
  const [unitMode] = useUnitMode()
  const screenOn = useWakeLock()
  const markMade = useMarkMade(recipe.id)
  const updateEntry = useUpdatePlanEntry()
  const swipe = React.useRef<{ x: number; y: number } | null>(null)
  useChatScreen({
    kind: "recipe",
    recipeId: recipe.id,
    recipeName: recipe.name,
    scale: factor,
  })

  // Cooking it with something it goes with: both, the pairing first.
  const combined =
    paired && paired.id !== recipe.id
      ? pairRecipes(recipe, paired, factor)
      : null
  const allIngredients = combined?.ingredients ?? recipe.ingredients
  const steps = combined?.steps ?? recipe.steps
  const factorOf = combined
    ? (id: string) => combined.factors.get(id) ?? factor
    : undefined

  // A "get ready" page first, to gather everything, then the steps.
  const hasPrep = allIngredients.length > 0
  const pages = steps.length + (hasPrep ? 1 : 0)
  const onPrep = hasPrep && index === 0
  const stepIndex = index - (hasPrep ? 1 : 0)
  const step = onPrep ? undefined : steps[stepIndex]
  const isLast = index >= pages - 1
  const highlighted = React.useMemo(
    () =>
      step ? ingredientsInStep(step.text, allIngredients) : new Set<string>(),
    [step, allIngredients]
  )
  const stepIngredients = allIngredients.filter((i) => highlighted.has(i.id))

  const go = React.useCallback(
    (next: number) =>
      setIndex(Math.min(Math.max(0, next), Math.max(0, pages - 1))),
    [pages]
  )

  // Picked up where it was left: say so, with a way back to the start.
  React.useEffect(() => {
    if (!resumed || resumed.index === 0) return
    toast("Picked up where you left off", {
      id: "cook-resumed",
      action: {
        label: "Start over",
        onClick: () => {
          setIndex(0)
          setChecked(new Set())
        },
      },
    })
  }, [resumed])

  React.useEffect(() => {
    saveProgress(
      recipe.id,
      index === 0 && checked.size === 0
        ? null
        : {
            index,
            checked: [...checked],
            with: withSlug,
            scale: factor,
            savedAt: Date.now(),
          }
    )
  }, [recipe.id, index, checked, withSlug, factor])

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [role=menu], [role=dialog]")
      ) {
        return
      }
      if (event.key === "ArrowRight") go(index + 1)
      if (event.key === "ArrowLeft") go(index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, index])

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** Back where cooking started from (the plan, today, the recipe). */
  function leave() {
    if (location.key !== "default") navigate(-1)
    else navigate(`/recipes/${recipe.slug}`)
  }

  function done(message: string, description?: string) {
    saveProgress(recipe.id, null)
    toast.success(message, { description })
    leave()
  }

  function finish() {
    const justMade = () =>
      markMade.mutate(undefined, {
        onSuccess: () => done("Nice work. Marked as made today."),
        onError: () => toast.error("Couldn't mark it made"),
      })
    if (!entryId) return justMade()
    updateEntry.mutate(
      { id: entryId, status: "cooked" },
      {
        onSuccess: (entry) =>
          done(
            "Nice work. Marked as cooked.",
            entry.pantryUsed.length
              ? `Took ${entry.pantryUsed.join(", ").toLowerCase()} out of the pantry.`
              : undefined
          ),
        // The meal was moved or removed from the plan since.
        onError: justMade,
      }
    )
  }

  const here = `${location.pathname}${location.search}`
  const ingredients = (
    <IngredientList
      ingredients={allIngredients}
      factorOf={factorOf}
      factor={factor}
      checked={checked}
      onToggle={toggle}
      highlighted={highlighted}
      idPrefix="cook"
      size="lg"
    />
  )
  const servings = recipe.servings ? recipe.servings * factor : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 md:px-8">
        <Button variant="outline" onClick={leave}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Exit
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-semibold">
            {combined?.name ?? recipe.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {onPrep
              ? "Get ready"
              : steps.length
                ? `Step ${stepIndex + 1} of ${steps.length}`
                : "No steps"}
            {screenOn && " · Screen stays on"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewTimerButton href={here} />
          <TextSizeMenu value={textSize} onChange={setTextSize} />
        </div>
        <TimerChips className="w-full sm:w-auto" />
      </header>

      {pages > 1 && (
        <nav aria-label="Steps" className="flex gap-1.5 px-4 md:px-8">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={
                hasPrep && i === 0
                  ? "Go to getting ready"
                  : `Go to step ${i + (hasPrep ? 0 : 1)}`
              }
              aria-current={i === index ? "step" : undefined}
              onClick={() => go(i)}
              className={cn(
                "group py-2",
                hasPrep && i === 0 ? "w-8" : "flex-1"
              )}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors",
                  i <= index
                    ? "bg-primary"
                    : "bg-border group-hover:bg-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </nav>
      )}

      <main
        className={cn(
          "grid flex-1 content-start gap-6 px-4 py-6 md:gap-10 md:px-8",
          !onPrep && "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
        )}
      >
        {!onPrep && (
          <Card className="hidden h-fit md:flex">
            <CardHeader className="grid gap-3">
              <CardTitle className="text-lg font-semibold">
                Ingredients
              </CardTitle>
              <UnitToggle ingredients={allIngredients} />
            </CardHeader>
            <CardContent>{ingredients}</CardContent>
          </Card>
        )}

        <section
          aria-live="polite"
          className="grid content-start gap-6 select-none md:pt-4"
          onPointerDown={(event) => {
            if (event.pointerType === "touch") {
              swipe.current = { x: event.clientX, y: event.clientY }
            }
          }}
          onPointerUp={(event) => {
            const from = swipe.current
            swipe.current = null
            if (!from) return
            const dx = event.clientX - from.x
            const dy = event.clientY - from.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              go(dx < 0 ? index + 1 : index - 1)
            }
          }}
        >
          {onPrep ? (
            <div className="mx-auto grid w-full max-w-3xl gap-6">
              <div className="grid gap-2">
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                  Get ready
                </p>
                <h2 className="font-heading text-3xl leading-tight font-semibold md:text-4xl">
                  Gather everything first
                </h2>
                <p
                  className={cn("text-muted-foreground", DETAIL_TEXT[textSize])}
                >
                  Get it all out and measured, ticking things off as you go.
                  {servings
                    ? ` Makes ${Math.round(servings * 100) / 100} servings.`
                    : ""}
                </p>
              </div>
              <UnitToggle ingredients={allIngredients} className="w-fit" />
              <div className="select-text">{ingredients}</div>
            </div>
          ) : step ? (
            <>
              {step.section && (
                <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {step.section}
                </p>
              )}
              <p
                className={cn(
                  "leading-snug tracking-tight select-text",
                  STEP_TEXT[textSize]
                )}
              >
                {splitDurations(step.text).map((part, i) =>
                  part.type === "text" ? (
                    <React.Fragment key={i}>{part.text}</React.Fragment>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        startTimer(part.label, part.seconds, here)
                        toast(`Timer started: ${part.label}`)
                      }}
                      className="mx-0.5 inline-flex items-center gap-1.5 rounded-full bg-highlight px-3 py-0.5 align-baseline font-semibold text-highlight-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <HugeiconsIcon
                        icon={Timer02Icon}
                        strokeWidth={2}
                        className="size-[0.8em]"
                      />
                      {part.text}
                    </button>
                  )
                )}
              </p>

              {stepIngredients.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    For this step
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {stepIngredients.map((ingredient) => {
                      const used = checked.has(ingredient.id)
                      return (
                        <li key={ingredient.id}>
                          <button
                            type="button"
                            aria-pressed={used}
                            onClick={() => toggle(ingredient.id)}
                            className={cn(
                              "rounded-2xl border px-3 py-1.5 text-left transition-colors",
                              DETAIL_TEXT[textSize],
                              used
                                ? "border-transparent bg-muted text-muted-foreground line-through"
                                : "bg-accent text-accent-foreground hover:bg-accent/80"
                            )}
                          >
                            <IngredientText
                              text={ingredient.text}
                              factor={factorOf?.(ingredient.id) ?? factor}
                              unitGrams={
                                unitMode === "grams"
                                  ? ingredient.unitGrams
                                  : null
                              }
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {steps[stepIndex + 1] && (
                <p
                  className={cn(
                    "max-w-prose rounded-2xl bg-muted p-4 text-muted-foreground",
                    DETAIL_TEXT[textSize]
                  )}
                >
                  <span className="font-semibold text-foreground">Next:</span>{" "}
                  {steps[stepIndex + 1]!.text}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg text-muted-foreground">
              This recipe has no steps yet. Add some from the Edit page.
            </p>
          )}
        </section>
      </main>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:px-8">
        <Button
          size="lg"
          variant="outline"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Back
        </Button>
        {!onPrep && (
          <Drawer>
            <DrawerTrigger asChild>
              <Button size="lg" variant="secondary" className="md:hidden">
                Ingredients
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80svh]">
              <DrawerHeader className="flex flex-row items-center justify-between gap-3">
                <DrawerTitle>Ingredients</DrawerTitle>
                <UnitToggle ingredients={allIngredients} />
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {ingredients}
              </div>
            </DrawerContent>
          </Drawer>
        )}
        {isLast ? (
          <Button
            size="lg"
            onClick={finish}
            disabled={markMade.isPending || updateEntry.isPending}
          >
            Done cooking
          </Button>
        ) : (
          <Button size="lg" onClick={() => go(index + 1)}>
            {onPrep ? "Start" : "Next"}
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        )}
      </footer>

      <ChatLauncher className="bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-24" />
    </div>
  )
}

function TextSizeMenu({
  value,
  onChange,
}: {
  value: TextSize
  onChange: (size: TextSize) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Text size"
          title="Text size"
        >
          <HugeiconsIcon icon={TextFontIcon} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Text size</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as TextSize)}
        >
          <DropdownMenuRadioItem value="standard">
            Standard
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="large">Large</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="huge">
            Extra large
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
