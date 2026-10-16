import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { displayIngredient, type UnitSystem } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { formatServings } from "./format"
import type { Recipe } from "./queries"

type Line = Recipe["ingredients"][number]

/** Lines grouped under their sections, in order. */
export function bySection<T extends { section: string | null }>(lines: T[]) {
  const groups: { section: string | null; lines: T[] }[] = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last && last.section === line.section) last.lines.push(line)
    else groups.push({ section: line.section, lines: [line] })
  }
  return groups
}

/** How many it's made for: the recipe's servings, or a multiple of it. */
export function useServings(recipe: Recipe) {
  const base = recipe.servings
  const [amount, setAmount] = React.useState(base ?? 1)
  const step = base === null || amount <= 2 ? 0.5 : 1
  return {
    /** What the amounts are multiplied by. */
    factor: base ? amount / base : amount,
    amount,
    base,
    more: () => setAmount((value) => value + step),
    fewer: () => setAmount((value) => Math.max(step, value - step)),
    reset: () => setAmount(base ?? 1),
    changed: amount !== (base ?? 1),
  }
}

export type Servings = ReturnType<typeof useServings>

/** − 4 servings + : making more or less of the recipe. */
export function ServingsStepper({ servings }: { servings: Servings }) {
  const { t } = useTranslation()
  const label = servings.base
    ? t("recipes.serves", {
        count: servings.amount,
        servings: formatServings(servings.amount),
      })
    : t("recipes.times", { factor: formatServings(servings.amount) })
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={servings.fewer}
        aria-label={t("recipes.fewerServings")}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <span
        className="min-w-24 text-center text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {label}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={servings.more}
        aria-label={t("recipes.moreServings")}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
      {servings.changed && (
        <Button variant="ghost" size="sm" onClick={servings.reset}>
          {t("recipes.reset")}
        </Button>
      )}
    </div>
  )
}

/** Whether showing metric or US amounts would change any line. */
export function convertible(lines: Line[]) {
  return lines.some((line) =>
    (["metric", "us"] as const).some(
      (system) =>
        displayIngredient(line.text, { system }).amount !==
        displayIngredient(line.text).amount
    )
  )
}

/** As written, metric or US. */
export function UnitToggle({
  system,
  onChange,
}: {
  system: UnitSystem
  onChange: (system: UnitSystem) => void
}) {
  const { t } = useTranslation()
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[system]}
      onValueChange={(value) => {
        const next = value[0] as UnitSystem | undefined
        if (next) onChange(next)
      }}
      aria-label={t("recipes.units.label")}
    >
      {(["written", "metric", "us"] as const).map((value) => (
        <ToggleGroupItem key={value} value={value}>
          {t(`recipes.units.${value}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** The ingredients, with their amounts scaled and in the chosen units. */
export function IngredientList({
  lines,
  factor,
  system,
}: {
  lines: Line[]
  factor: number
  system: UnitSystem
}) {
  return (
    <div className="space-y-5">
      {bySection(lines).map((group, index) => (
        <section key={index} className="space-y-2">
          {group.section && (
            <h3 className="font-heading text-base font-semibold">
              {group.section}
            </h3>
          )}
          <ul className="space-y-2">
            {group.lines.map((line) => {
              const { amount, rest } = displayIngredient(line.text, {
                factor,
                system,
              })
              return (
                <li key={line.id} className="flex gap-3 leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                  />
                  <span>
                    {amount && (
                      <strong className="font-semibold">{amount}</strong>
                    )}
                    {rest}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
