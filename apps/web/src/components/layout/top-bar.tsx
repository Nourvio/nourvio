import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { UserMenu } from "./user-menu"

export function TopBar() {
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:rounded-t-xl md:px-6">
      <div className="flex h-14 w-full items-center gap-2">
        <SidebarTrigger className="hidden md:inline-flex" />
        <Link to="/" className="md:hidden" aria-label={t("app.home")}>
          <Logo />
        </Link>
        {/* iPad and desktop have the account menu at the foot of the sidebar. */}
        <div className="ml-auto md:hidden">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
