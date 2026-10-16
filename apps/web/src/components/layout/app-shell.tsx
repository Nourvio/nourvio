import { Outlet } from "@tanstack/react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import { AppSidebar } from "./app-sidebar"
import { BottomNav } from "./bottom-nav"
import { TopBar } from "./top-bar"

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        {/* Bottom padding keeps content clear of the phone's tab bar. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 md:px-8 md:pb-12">
          <Outlet />
        </main>
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}
