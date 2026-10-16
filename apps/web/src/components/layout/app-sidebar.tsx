import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { isSectionActive, PRIMARY_NAV } from "./nav-items"
import { SidebarUserMenu } from "./user-menu"

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:justify-center"
              render={<Link to="/" aria-label={t("app.home")} />}
            >
              <Logo className="group-data-[collapsible=icon]:[&>span]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isSectionActive(item.to, pathname)}
                    tooltip={t(item.labelKey)}
                    render={<Link to={item.to} />}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    <span>{t(item.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
