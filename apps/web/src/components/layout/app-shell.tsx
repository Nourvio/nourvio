import { Outlet } from "react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ChatLauncher } from "@/features/chat/chat-launcher"

import { AppSidebar } from "./app-sidebar"
import { BottomNav } from "./bottom-nav"
import { TopBar } from "./top-bar"

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        {/* Bottom padding keeps content clear of the phone tab bar and chat button. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 md:px-8 md:pb-12">
          <Outlet />
        </main>
      </SidebarInset>
      <BottomNav />
      <ChatLauncher />
    </SidebarProvider>
  )
}
