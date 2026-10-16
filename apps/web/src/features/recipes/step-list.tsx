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
    <div className="space-y-6">
      {bySection(steps).map((group, index) => (
        <section key={index} className="space-y-3">
          {group.section && (
            <h3 className="font-heading text-base font-semibold">
              {group.section}
            </h3>
          )}
          <ol className="space-y-4">
            {group.lines.map((step) => {
              number += 1
              return (
                <li key={step.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                  >
                    {number}
                  </span>
                  <p className="pt-0.5 leading-relaxed">
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
