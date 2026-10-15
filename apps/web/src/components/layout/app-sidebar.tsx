import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { Link, NavLink, useLocation } from "react-router"

import { Logo } from "@/components/brand/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useUpdateAvailable } from "@/features/settings/use-updates"

import { isSectionActive, PRIMARY_NAV } from "./nav-items"

export function AppSidebar() {
  const { pathname } = useLocation()
  const updateReady = useUpdateAvailable()

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" aria-label="Mise home">
                <Logo />
              </Link>
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
                    asChild
                    isActive={isSectionActive(item.to, pathname)}
                    tooltip={item.label}
                  >
                    <NavLink to={item.to} end={item.to === "/"}>
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip={updateReady ? "Settings · update ready" : "Settings"}
            >
              <NavLink to={updateReady ? "/settings#updates" : "/settings"}>
                <span className="relative flex">
                  <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                  {updateReady && (
                    <span className="absolute -top-0.5 -right-0.5 hidden size-2 rounded-full bg-primary ring-2 ring-sidebar group-data-[collapsible=icon]:block" />
                  )}
                </span>
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
            {updateReady && (
              <SidebarMenuBadge className="rounded-full bg-primary px-2 text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground">
                Update
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
