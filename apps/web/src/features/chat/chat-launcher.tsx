import { HugeiconsIcon } from "@hugeicons/react"
import { BubbleChatSparkIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

import { useChat } from "./chat-provider"
import { ChatPanel } from "./chat-panel"

/**
 * Floating chat button. Opens a bottom drawer on phones and a side panel on
 * iPad and desktop, so the recipe stays visible next to the conversation.
 */
export function ChatLauncher({ className }: { className?: string }) {
  const isMobile = useIsMobile()
  const chat = useChat()

  const trigger = (
    <Button
      size="icon-lg"
      aria-label="Open the cooking assistant"
      onClick={() => chat.setOpen(true)}
      className={cn(
        "fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 size-14 shadow-lg md:right-6 md:bottom-6",
        chat.open && "hidden",
        className
      )}
    >
      <HugeiconsIcon
        icon={BubbleChatSparkIcon}
        strokeWidth={2}
        className="size-6"
      />
    </Button>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={chat.open} onOpenChange={chat.setOpen}>
          <DrawerContent className="h-[88svh]">
            <DrawerDescription className="sr-only">
              Ask the cooking assistant about recipes, swaps and ideas.
            </DrawerDescription>
            <ChatPanel Title={DrawerTitle} />
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <>
      {trigger}
      {/* Not modal: the recipe stays usable beside the conversation. */}
      <Sheet open={chat.open} onOpenChange={chat.setOpen} modal={false}>
        <SheetContent
          className="flex w-full flex-col gap-0 sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <SheetDescription className="sr-only">
            Ask the cooking assistant about recipes, swaps and ideas.
          </SheetDescription>
          <ChatPanel Title={SheetTitle} />
        </SheetContent>
      </Sheet>
    </>
  )
}
