import {
  Calendar03Icon,
  CookBookIcon,
  FridgeIcon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"

/** Main sections, shown in the sidebar (iPad/desktop) and bottom tabs (phone). */
export const PRIMARY_NAV = [
  { to: "/recipes", label: "Recipes", icon: CookBookIcon },
  { to: "/plan", label: "Plan", icon: Calendar03Icon },
  { to: "/list", label: "List", icon: ShoppingBasket01Icon },
  { to: "/pantry", label: "Pantry", icon: FridgeIcon },
]
