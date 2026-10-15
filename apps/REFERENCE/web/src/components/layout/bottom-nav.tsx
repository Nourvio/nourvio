import { HugeiconsIcon } from "@hugeicons/react"
import { NavLink } from "react-router"

import { cn } from "@/lib/utils"

import { PRIMARY_NAV } from "./nav-items"

/** Phone-only tab bar. iPad and desktop use the sidebar instead. */
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs font-medium text-muted-foreground transition-colors",
                  isActive && "text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-8 w-12 items-center justify-center rounded-full transition-colors min-[400px]:w-14",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <HugeiconsIcon
                      icon={item.icon}
                      strokeWidth={isActive ? 2.2 : 1.8}
                      className="size-5"
                    />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
