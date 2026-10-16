import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
})

const SECTIONS = [
  { to: "/settings/you", labelKey: "settings.you.tab" },
  { to: "/settings/household", labelKey: "settings.household.tab" },
] as const

function SettingsLayout() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <nav
        aria-label={t("settings.sections")}
        className="mb-6 flex w-fit gap-1 rounded-4xl bg-muted p-1"
      >
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="rounded-4xl px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            activeProps={{
              className: "bg-background text-foreground shadow-sm",
            }}
          >
            {t(section.labelKey)}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        <Outlet />
      </div>
    </>
  )
}
