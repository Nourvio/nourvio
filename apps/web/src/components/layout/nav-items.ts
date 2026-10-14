import {
  Calendar03Icon,
  CookBookIcon,
  FridgeIcon,
  Home01Icon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"

/** Main sections, shown in the sidebar (iPad/desktop) and bottom tabs (phone). */
export const PRIMARY_NAV = [
  { to: "/", label: "Today", icon: Home01Icon },
  { to: "/recipes", label: "Recipes", icon: CookBookIcon },
  { to: "/plan", label: "Plan", icon: Calendar03Icon },
  { to: "/list", label: "List", icon: ShoppingBasket01Icon },
  { to: "/pantry", label: "Pantry", icon: FridgeIcon },
]

/** Whether a section is the one open; "/" only on the home page itself. */
export function isSectionActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}
