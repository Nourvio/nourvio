import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { tasteWarnings, type Diet, type RecipeIngredient } from "@mise/shared"
import { Link } from "react-router"

import { cn } from "@/lib/utils"
import { useHouseholdInfo } from "@/features/settings/use-household"

/** What in a recipe goes against the household's tastes and rules, allergies first. */
export function TasteWarnings({
  ingredients,
  diets,
}: {
  ingredients: RecipeIngredient[]
  diets: Diet[]
}) {
  const household = useHouseholdInfo()
  const tastes = household.data?.tastes
  if (!tastes) return null
  const warnings = tasteWarnings(
    ingredients.map((ingredient) => ingredient.text),
    diets,
    tastes
  )
  if (!warnings.length) return null
  const allergy = warnings.some((warning) => warning.allergy)
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm",
        allergy
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5"
      )}
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className={cn(
          "mt-0.5 size-4 shrink-0",
          allergy ? "text-destructive" : "text-amber-600 dark:text-amber-400"
        )}
      />
      <p className="min-w-0">
        {warnings.map((warning, index) => (
          <span
            key={warning.text}
            className={cn(warning.allergy && "font-medium text-destructive")}
          >
            {index > 0 && " · "}
            {warning.text}
          </span>
        ))}{" "}
        <Link
          to="/settings#tastes"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Household rules
        </Link>
      </p>
    </div>
  )
}
