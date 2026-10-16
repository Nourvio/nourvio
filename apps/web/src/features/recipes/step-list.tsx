import { convertTemperatures, type UnitSystem } from "@merran/shared"

import { bySection } from "./ingredient-list"
import type { Recipe } from "./queries"

/** The steps, numbered right through, under their sections. */
export function StepList({
  steps,
  system,
}: {
  steps: Recipe["steps"]
  system: UnitSystem
}) {
  let number = 0
  return (
    <div className="grid gap-6">
      {bySection(steps).map((group, index) => (
        <section key={index} className="grid gap-4">
          {group.section && (
            <h3 className="text-lg font-semibold">{group.section}</h3>
          )}
          <ol className="grid gap-5">
            {group.lines.map((step) => {
              number += 1
              return (
                <li key={step.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                  >
                    {number}
                  </span>
                  <p className="pt-1 text-lg leading-relaxed">
                    {convertTemperatures(step.text, system)}
                  </p>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
