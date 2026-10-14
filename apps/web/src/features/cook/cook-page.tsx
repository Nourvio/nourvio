import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  Timer02Icon,
} from "@hugeicons/core-free-icons"
import type { Recipe } from "@mise/shared"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
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
import { Spinner } from "@/components/ui/spinner"
import { NotFoundPage } from "@/app/not-found-page"
import { ChatLauncher } from "@/features/chat/chat-launcher"
import { IngredientList } from "@/features/recipes/ingredient-list"
import { useMarkMade, useRecipe } from "@/features/recipes/use-recipes"
import { cn } from "@/lib/utils"

import { ingredientsInStep, splitDurations } from "./step-text"
import { TimerChips, useTimers } from "./timers"
import { useWakeLock } from "./use-wake-lock"

export function CookPage() {
  const { slug = "" } = useParams()
  const recipe = useRecipe(slug)

  if (recipe.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (recipe.isError) return <NotFoundPage />
  return <CookView recipe={recipe.data} />
}

function CookView({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const factor =
    Number(params.get("scale")) > 0 ? Number(params.get("scale")) : 1
  const [index, setIndex] = React.useState(0)
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const { timers, now, start, dismiss } = useTimers()
  const screenOn = useWakeLock()
  const markMade = useMarkMade(recipe.id)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const steps = recipe.steps
  const step = steps[index]
  const isLast = index >= steps.length - 1
  const highlighted = React.useMemo(
    () =>
      step
        ? ingredientsInStep(step.text, recipe.ingredients)
        : new Set<string>(),
    [step, recipe.ingredients]
  )

  const go = React.useCallback(
    (next: number) =>
      setIndex(Math.min(Math.max(0, next), Math.max(0, steps.length - 1))),
    [steps.length]
  )

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea")
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

  function finish() {
    markMade.mutate(undefined, {
      onSuccess: () => {
        toast.success("Nice work. Marked as made today.")
        navigate(`/recipes/${recipe.slug}`)
      },
    })
  }

  const ingredients = (
    <IngredientList
      ingredients={recipe.ingredients}
      factor={factor}
      checked={checked}
      onToggle={toggle}
      highlighted={highlighted}
      idPrefix="cook"
      size="lg"
    />
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 md:px-8">
        <Button variant="outline" asChild>
          <Link to={`/recipes/${recipe.slug}`}>
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Exit
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-semibold">
            {recipe.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {steps.length ? `Step ${index + 1} of ${steps.length}` : "No steps"}
            {screenOn && " · Screen stays on"}
          </p>
        </div>
        <TimerChips timers={timers} now={now} onDismiss={dismiss} />
      </header>

      {steps.length > 1 && (
        <nav aria-label="Steps" className="flex gap-1.5 px-4 md:px-8">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => go(i)}
              className="group flex-1 py-2"
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

      <main className="grid flex-1 content-start gap-6 px-4 py-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-10 md:px-8">
        <Card className="hidden h-fit md:flex">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ingredients</CardTitle>
          </CardHeader>
          <CardContent>{ingredients}</CardContent>
        </Card>

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
          {step ? (
            <>
              {step.section && (
                <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {step.section}
                </p>
              )}
              <p className="text-2xl leading-snug tracking-tight select-text md:text-3xl lg:text-4xl">
                {splitDurations(step.text).map((part, i) =>
                  part.type === "text" ? (
                    <React.Fragment key={i}>{part.text}</React.Fragment>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        start(part.label, part.seconds)
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
              {steps[index + 1] && (
                <p className="max-w-prose rounded-2xl bg-muted p-4 text-base text-muted-foreground">
                  <span className="font-semibold text-foreground">Next:</span>{" "}
                  {steps[index + 1]!.text}
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
        <Drawer>
          <DrawerTrigger asChild>
            <Button size="lg" variant="secondary" className="md:hidden">
              Ingredients
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[80svh]">
            <DrawerHeader>
              <DrawerTitle>Ingredients</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {ingredients}
            </div>
          </DrawerContent>
        </Drawer>
        {isLast ? (
          <Button size="lg" onClick={finish} disabled={markMade.isPending}>
            Done cooking
          </Button>
        ) : (
          <Button size="lg" onClick={() => go(index + 1)}>
            Next
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
