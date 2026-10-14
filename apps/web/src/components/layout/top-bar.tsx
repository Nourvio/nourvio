import { Link } from "react-router"

import { Logo } from "@/components/brand/logo"
import { ModeToggle } from "@/components/theme/mode-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { TimerBadges } from "@/features/cook/timers"

import { UserMenu } from "./user-menu"

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:rounded-t-xl md:px-6">
      <div className="flex h-14 w-full items-center gap-2">
        <SidebarTrigger className="hidden md:inline-flex" />
        <Link to="/" className="md:hidden" aria-label="Mise home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <TimerBadges />
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
