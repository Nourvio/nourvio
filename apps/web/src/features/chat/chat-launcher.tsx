import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp02Icon, BubbleChatSparkIcon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"

const SUGGESTIONS = [
  "No buttermilk, what can I use?",
  "Dinner in 30 minutes with chicken thighs",
  "Plan next week and use up the spinach",
]

/**
 * Floating chat button. Opens a bottom drawer on phones and a side panel on
 * iPad and desktop, so the recipe stays visible next to the conversation.
 */
export function ChatLauncher() {
  const isMobile = useIsMobile()

  const trigger = (
    <Button
      size="icon-lg"
      aria-label="Open the cooking assistant"
      className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 size-14 shadow-lg md:right-6 md:bottom-6"
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
      <Drawer>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="h-[85svh]">
          <DrawerHeader>
            <DrawerTitle>Assistant</DrawerTitle>
            <DrawerDescription>Ideas, swaps and plans</DrawerDescription>
          </DrawerHeader>
          <ChatPanel />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>Ideas, swaps and plans</SheetDescription>
        </SheetHeader>
        <ChatPanel />
      </SheetContent>
    </Sheet>
  )
}

function ChatPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={BubbleChatSparkIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Your cooking assistant</EmptyTitle>
          <EmptyDescription>
            Ask for ideas, swap an ingredient, or plan the week. The assistant
            arrives in milestone 2.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <Badge key={suggestion} variant="outline" className="h-auto py-1">
                {suggestion}
              </Badge>
            ))}
          </div>
        </EmptyContent>
      </Empty>
      <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <InputGroup>
          <InputGroupTextarea
            placeholder="Ask anything about cooking"
            rows={1}
            disabled
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="ml-auto rounded-full"
              aria-label="Send"
              disabled
            >
              <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}
