import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  TextFontIcon,
  Timer02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  convertTemperatures,
  displayIngredient,
  ingredientsInStep,
  splitDurations,
  type UnitSystem,
} from "@merran/shared"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { formatServings } from "@/features/recipes/format"
import {
  convertible,
  IngredientList,
  UnitToggle,
  useTicks,
} from "@/features/recipes/ingredient-list"
import { useRefreshRecipes, type Recipe } from "@/features/recipes/queries"
import { useUnitSystem } from "@/features/recipes/use-unit-system"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import {
  loadProgress,
  saveProgress,
  TEXT_SIZES,
  useTextSize,
  type TextSize,
} from "./progress"
import { NewTimerButton, startTimer, TimerChips, type Cooking } from "./timers"
import { formatDuration, stepWords } from "./durations"
import { useWakeLock } from "./use-wake-lock"

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

/**
 * Cooking a recipe: getting everything out first, then one step at a time in
 * big text, with timers, the step's ingredients, and the screen kept on.
 */
export function CookView({ recipe, scale }: { recipe: Recipe; scale: number }) {
  const { t } = useTranslation()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const { ingredients, steps } = recipe

  // A "get ready" page first, to gather everything, then the steps.
  const hasPrep = ingredients.length > 0
  const pages = steps.length + (hasPrep ? 1 : 0)
  const [resumed] = React.useState(() => loadProgress(recipe.id, scale))
  const [page, setPage] = React.useState(() =>
    Math.min(resumed?.page ?? 0, Math.max(0, pages - 1))
  )
  const ticks = useTicks(resumed?.ticked)
  const [system, setSystem] = useUnitSystem()
  const [textSize, setTextSize] = useTextSize()
  const screenOn = useWakeLock()
  const [finishing, setFinishing] = React.useState(false)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const onPrep = hasPrep && page === 0
  const stepIndex = page - (hasPrep ? 1 : 0)
  const step = onPrep ? undefined : steps[stepIndex]
  const next = onPrep ? undefined : steps[stepIndex + 1]
  const isLast = page >= pages - 1
  const highlighted = React.useMemo(
    () =>
      step ? ingredientsInStep(step.text, ingredients) : new Set<string>(),
    [step, ingredients]
  )
  const stepIngredients = ingredients.filter((line) => highlighted.has(line.id))
  const cooking: Cooking = { slug: recipe.slug, scale }
  const showUnits = convertible(ingredients)

  const go = React.useCallback(
    (to: number) => setPage(Math.min(Math.max(0, to), Math.max(0, pages - 1))),
    [pages]
  )

  // Picked up where it was left: say so, with a way back to the start.
  const { clear } = ticks
  React.useEffect(() => {
    if (!resumed || resumed.page === 0) return
    toast(t("cook.resumed"), {
      id: "cook-resumed",
      position: "top-center",
      action: {
        label: t("cook.startOver"),
        onClick: () => {
          setPage(0)
          clear()
        },
      },
    })
  }, [resumed, t, clear])

  React.useEffect(() => {
    saveProgress(
      recipe.id,
      page === 0 && ticks.ticked.size === 0
        ? null
        : {
            page,
            ticked: [...ticks.ticked],
            scale,
            savedAt: Date.now(),
          }
    )
  }, [recipe.id, page, ticks.ticked, scale])

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [role=menu], [role=dialog]")
      ) {
        return
      }
      if (event.key === "ArrowRight") go(page + 1)
      if (event.key === "ArrowLeft") go(page - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, page])

  /** Back where cooking started from: the recipe, or wherever it was. */
  function leave() {
    if (canGoBack) router.history.back()
    else void navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
  }

  async function finish() {
    setFinishing(true)
    try {
      await unwrap(
        api.POST("/api/recipes/{recipe}/made", {
          params: { path: { recipe: recipe.id } },
        })
      )
      saveProgress(recipe.id, null)
      await refresh()
      toast.success(t("cook.made"))
      leave()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setFinishing(false)
    }
  }

  const list = (size: "default" | "lg") => (
    <IngredientList
      lines={ingredients}
      factor={scale}
      system={system}
      ticks={ticks}
      highlighted={highlighted}
      size={size}
    />
  )
  const servings = recipe.servings ? recipe.servings * scale : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 md:px-8">
        <Button variant="outline" onClick={leave}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("cook.exit")}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-semibold">
            {recipe.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {onPrep
              ? t("cook.getReady")
              : steps.length > 0
                ? t("cook.stepOf", {
                    step: stepIndex + 1,
                    count: steps.length,
                  })
                : t("cook.noSteps")}
            {screenOn && ` · ${t("cook.screenOn")}`}
          </p>
        </div>
        {/* Before the buttons, so starting a timer doesn't move them. On
            phones the timers take a row of their own below. */}
        <TimerChips className="order-last w-full sm:order-none sm:w-auto" />
        <div className="flex items-center gap-2">
          <NewTimerButton cooking={cooking} />
          <TextSizeMenu value={textSize} onChange={setTextSize} />
        </div>
      </header>

      {pages > 1 && (
        <nav aria-label={t("cook.steps")} className="flex gap-1.5 px-4 md:px-8">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={
                hasPrep && i === 0
                  ? t("cook.goToReady")
                  : t("cook.goToStep", { step: i + (hasPrep ? 0 : 1) })
              }
              aria-current={i === page ? "step" : undefined}
              onClick={() => go(i)}
              className={cn(
                "group py-2",
                hasPrep && i === 0 ? "w-8" : "flex-1"
              )}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors",
                  i <= page
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
          !onPrep && hasPrep && "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
        )}
      >
        {!onPrep && hasPrep && (
          <Card className="hidden h-fit md:flex">
            <CardHeader className="grid gap-3">
              <CardTitle className="text-lg font-semibold">
                {t("recipes.fields.ingredients")}
              </CardTitle>
              {showUnits && <UnitToggle system={system} onChange={setSystem} />}
            </CardHeader>
            <CardContent>{list("default")}</CardContent>
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
              go(dx < 0 ? page + 1 : page - 1)
            }
          }}
        >
          {onPrep ? (
            <div className="mx-auto grid w-full max-w-3xl gap-6">
              <div className="grid gap-2">
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                  {t("cook.getReady")}
                </p>
                <h1 className="font-heading text-3xl leading-tight font-semibold md:text-4xl">
                  {t("cook.gather")}
                </h1>
                <p
                  className={cn("text-muted-foreground", DETAIL_TEXT[textSize])}
                >
                  {t("cook.gatherHint")}
                  {servings !== null &&
                    ` ${t("cook.makes", {
                      count: servings,
                      servings: formatServings(servings),
                    })}`}
                </p>
              </div>
              {showUnits && (
                <UnitToggle
                  system={system}
                  onChange={setSystem}
                  className="w-fit"
                />
              )}
              <div className="select-text">{list("lg")}</div>
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
                <StepText text={step.text} system={system} cooking={cooking} />
              </p>

              {stepIngredients.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("cook.forThisStep")}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {stepIngredients.map((line) => {
                      const done = ticks.ticked.has(line.id)
                      const { amount, rest } = displayIngredient(line.text, {
                        factor: scale,
                        system,
                      })
                      return (
                        <li key={line.id}>
                          <button
                            type="button"
                            aria-pressed={done}
                            onClick={() => ticks.toggle(line.id)}
                            className={cn(
                              "rounded-2xl border px-3 py-1.5 text-left transition-colors",
                              DETAIL_TEXT[textSize],
                              done
                                ? "border-transparent bg-muted text-muted-foreground line-through"
                                : "bg-accent text-accent-foreground hover:bg-accent/80"
                            )}
                          >
                            {amount && (
                              <span className="font-semibold">{amount}</span>
                            )}
                            {rest}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {next && (
                <p
                  className={cn(
                    "max-w-prose rounded-2xl bg-muted p-4 text-muted-foreground",
                    DETAIL_TEXT[textSize]
                  )}
                >
                  <span className="font-semibold text-foreground">
                    {t("cook.upNext")}
                  </span>{" "}
                  {stepWords(t, convertTemperatures(next.text, system))}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg text-muted-foreground">
              {t("cook.noStepsYet")}
            </p>
          )}
        </section>
      </main>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:px-8">
        <Button
          size="lg"
          variant="outline"
          onClick={() => go(page - 1)}
          disabled={page === 0}
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("cook.back")}
        </Button>
        {!onPrep && hasPrep && (
          <Sheet>
            <SheetTrigger
              render={
                <Button size="lg" variant="secondary" className="md:hidden" />
              }
            >
              {t("recipes.fields.ingredients")}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80svh]">
              <SheetHeader className="grid gap-3 pr-14">
                <SheetTitle>{t("recipes.fields.ingredients")}</SheetTitle>
                {showUnits && (
                  <UnitToggle system={system} onChange={setSystem} />
                )}
              </SheetHeader>
              <div className="overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                {list("default")}
              </div>
            </SheetContent>
          </Sheet>
        )}
        {isLast ? (
          <Button size="lg" onClick={() => void finish()} disabled={finishing}>
            {t("cook.done")}
          </Button>
        ) : (
          <Button size="lg" onClick={() => go(page + 1)}>
            {onPrep ? t("cook.start") : t("cook.next")}
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        )}
      </footer>
    </div>
  )
}

/**
 * A step's words, with each time in it a button that starts a timer. Times
 * read the same way whatever the recipe wrote: "a minute" is "1 minute".
 */
function StepText({
  text,
  system,
  cooking,
}: {
  text: string
  system: UnitSystem
  cooking: Cooking
}) {
  const { t } = useTranslation()
  return splitDurations(convertTemperatures(text, system)).map((piece, i) => {
    if (piece.type === "text") {
      return <React.Fragment key={i}>{piece.text}</React.Fragment>
    }
    const label = formatDuration(t, piece.seconds, piece.upTo)
    return (
      <button
        key={i}
        type="button"
        onClick={() => startTimer(label, piece.seconds, cooking)}
        aria-label={t("cook.timers.startFor", { label })}
        className="mx-0.5 inline-flex items-center gap-1.5 rounded-full bg-highlight px-3 py-0.5 align-baseline font-semibold text-highlight-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <HugeiconsIcon
          icon={Timer02Icon}
          strokeWidth={2}
          className="size-[0.8em]"
        />
        {label}
      </button>
    )
  })
}

/** Standard, large or extra large steps, kept on this device. */
function TextSizeMenu({
  value,
  onChange,
}: {
  value: TextSize
  onChange: (size: TextSize) => void
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("cook.textSize.label")}
            title={t("cook.textSize.label")}
          />
        }
      >
        <HugeiconsIcon icon={TextFontIcon} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("cook.textSize.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as TextSize)}
          >
            {TEXT_SIZES.map((size) => (
              <DropdownMenuRadioItem key={size} value={size}>
                {t(`cook.textSize.${size}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
