import { levelOf, namesFood } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import type { Recipe } from "./queries"
import { useSetNeeds, type RecipeTastes } from "./use-tastes"

/**
 * What the household's tastes make of a recipe, above its ingredients:
 * what's left out and who for, with a way to say the recipe needs it, and
 * what keeps it from being suggested.
 */
export function TastesNote({
  recipe,
  tastes,
}: {
  recipe: Recipe
  tastes: RecipeTastes
}) {
  const { t } = useTranslation()
  const needs = useSetNeeds(recipe)
  if (tastes.leaveOut.length === 0 && tastes.ruledOut.length === 0) return null

  return (
    <ul className="grid gap-1.5" aria-label={t("recipes.tastes.label")}>
      {tastes.leaveOut.map(({ food, who }) => (
        <Note
          key={`out:${food}`}
          text={
            who
              ? t("recipes.tastes.leaving", { food, who })
              : t("recipes.tastes.leavingAll", { food })
          }
          action={t("recipes.tastes.need", { food })}
          disabled={needs.saving}
          onAction={() => void needs.need(food)}
        />
      ))}
      {tastes.ruledOut.map((item) => {
        const { food, who } = item
        const level = levelOf(item)
        // A dislike that's usually left out, but not from this one.
        const needed =
          level === "leave-out" &&
          recipe.needs.some((need) => namesFood(need, food))
        const text = needed
          ? who
            ? t("recipes.tastes.needed", { food, who })
            : t("recipes.tastes.neededAll", { food })
          : level === "leave-out"
            ? who
              ? t("recipes.tastes.dish", { food, who })
              : t("recipes.tastes.dishAll", { food })
            : level === "allergy"
              ? who
                ? t("recipes.tastes.allergy", { food, who })
                : t("recipes.tastes.allergyAll", { food })
              : who
                ? t("recipes.tastes.never", { food, who })
                : t("recipes.tastes.neverAll", { food })
        return (
          <Note
            key={`ruled:${food}`}
            text={text}
            tone={level === "allergy" ? "warning" : "muted"}
            action={needed ? t("recipes.tastes.canLeaveOut") : undefined}
            disabled={needs.saving}
            onAction={() => void needs.leaveOut(food)}
          />
        )
      })}
    </ul>
  )
}

function Note({
  text,
  tone = "muted",
  action,
  disabled,
  onAction,
}: {
  text: string
  tone?: "muted" | "warning"
  action?: string
  disabled: boolean
  onAction: () => void
}) {
  return (
    <li
      className={
        tone === "warning"
          ? "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground"
      }
    >
      <span className="min-w-0">{text}</span>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 -mr-2"
          disabled={disabled}
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </li>
  )
}
