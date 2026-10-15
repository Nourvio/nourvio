import { addDays } from "@mise/shared"

import { monthDay, shortDayName, today } from "@/features/plan/dates"

/** "through Tue", or "through Nov 3" when it's more than a week off. */
export function saleThrough(date: string) {
  const now = today()
  if (date <= now) return "ends today"
  return `through ${date <= addDays(now, 6) ? shortDayName(date) : monthDay(date)}`
}

/** "Chicken thighs on sale", "Chicken thighs and salmon on sale". */
export function onSaleText(sales: { food: string }[]) {
  const foods = sales.map((sale) => sale.food.toLowerCase())
  const named =
    foods.length <= 2
      ? foods.join(" and ")
      : `${foods.slice(0, 2).join(", ")} and ${foods.length - 2} more`
  return `${named[0]?.toUpperCase() ?? ""}${named.slice(1)} on sale`
}
