import { costShown, type RecipeCostDetail } from "@mise/shared"
import { useQuery } from "@tanstack/react-query"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" })

const SHOP_NAMES = { kroger: "Fry's", walmart: "Walmart", costco: "Costco" }

/** A recipe's cost, ingredient by ingredient. */
export function useRecipeCost(recipeId: string) {
  return useQuery({
    queryKey: ["recipes", "costs", recipeId],
    queryFn: async () =>
      (
        await api<{ cost: RecipeCostDetail | null }>(
          `/recipes/${recipeId}/cost`
        )
      ).cost,
    staleTime: 5 * 60_000,
  })
}

/**
 * "About $12.06 · $3.02 a serving" among the recipe's facts, opening how it
 * adds up. Nothing until most of the recipe has a price.
 */
export function CostFact({
  recipeId,
  factor,
}: {
  recipeId: string
  /** The servings stepper's scale. */
  factor: number
}) {
  const detail = useRecipeCost(recipeId).data
  const cost = costShown(detail)
  if (!detail || !cost) return null
  const lines = detail.lines.filter((line) => !line.onHand)

  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Cost
      </dt>
      <dd>
        <Popover>
          <PopoverTrigger className="rounded-md font-medium underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            About {money(cost.total * factor)}
            {cost.perServing !== null && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {money(cost.perServing)} a serving
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="mb-2 text-sm font-medium">How it adds up</p>
            <ul className="grid grid-cols-1 gap-1.5 text-sm">
              {lines.map((line, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{line.text}</span>
                    {line.product && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {line.shop ? `${SHOP_NAMES[line.shop]}: ` : ""}
                        {line.product}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      line.cost === null && "text-muted-foreground"
                    )}
                  >
                    {line.cost === null
                      ? "no price"
                      : `${line.sure ? "" : "~"}${money(line.cost * factor)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              What the recipe uses of each product Mise remembers, at today's
              price.
              {cost.priced < cost.counted &&
                ` ${cost.counted - cost.priced} of ${cost.counted} have no price yet; the morning price check fills them in.`}{" "}
              Salt, pepper and other always-on-hand things aren't counted.
            </p>
          </PopoverContent>
        </Popover>
      </dd>
    </div>
  )
}
