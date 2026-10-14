import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { Link } from "react-router"

import { Logo } from "@/components/brand/logo"
import { ModeToggle } from "@/components/theme/mode-toggle"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:rounded-t-xl md:px-6">
      <div className="flex h-14 w-full items-center gap-2">
        <SidebarTrigger className="hidden md:inline-flex" />
        <Link to="/recipes" className="md:hidden" aria-label="Mise home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ModeToggle />
          <Button variant="ghost" size="icon" asChild className="md:hidden">
            <Link to="/settings" aria-label="Settings">
              <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
