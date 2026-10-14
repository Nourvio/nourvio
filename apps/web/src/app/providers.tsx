import type * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSession } from "@/features/auth/use-session"
import { ChatProvider } from "@/features/chat/chat-provider"
import { TimerAlarm } from "@/features/cook/timers"
import { queryClient } from "@/lib/query-client"

/** A fresh assistant for each person signing in on this device. */
function ChatForUser({ children }: { children: React.ReactNode }) {
  const session = useSession()
  return (
    <ChatProvider key={session.data?.id ?? "signed-out"}>
      {children}
    </ChatProvider>
  )
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <ChatForUser>{children}</ChatForUser>
          <Toaster position="top-center" />
          <TimerAlarm />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
