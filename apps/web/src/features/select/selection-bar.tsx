import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import type { Selection } from "./use-selection"

export type SelectionAction = {
  label: string
  icon?: IconSvgElement
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/**
 * "4 selected · Select all · Done", in place of a page's own header
 * buttons while selecting.
 */
export function SelectionHeader({
  selection,
  allIds,
}: {
  selection: Selection
  /** Everything showing, for Select all. */
  allIds: string[]
}) {
  const all = allIds.length > 0 && allIds.every((id) => selection.isPicked(id))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="px-1 text-base font-semibold" aria-live="polite">
        {selection.count ? `${selection.count} selected` : "Select some"}
      </span>
      <Button
        variant="outline"
        disabled={!allIds.length}
        onClick={() => selection.toggleAll(allIds)}
      >
        {all ? "Select none" : `Select all ${allIds.length}`}
      </Button>
      <Button variant="secondary" onClick={selection.done}>
        Done
      </Button>
    </div>
  )
}

/**
 * The actions for what's selected, in a bar at the bottom of the screen
 * (above the tabs on a phone): the main ones as buttons, the rest under
 * More.
 */
export function SelectionBar({
  selection,
  actions,
  more = [],
}: {
  selection: Selection
  actions: SelectionAction[]
  more?: SelectionAction[]
}) {
  if (!selection.selecting) return null
  const none = selection.count === 0
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-6">
      <div
        role="toolbar"
        aria-label={`Actions for ${selection.count} selected`}
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-foreground p-1.5 text-background shadow-2xl"
      >
        {actions.map((action) => (
          <BarButton key={action.label} action={action} disabled={none} />
        ))}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                disabled={none}
                className="shrink-0 rounded-full text-background hover:bg-background/15 hover:text-background"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {more.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  disabled={action.disabled}
                  variant={action.destructive ? "destructive" : "default"}
                  onSelect={action.onSelect}
                >
                  {action.icon && (
                    <HugeiconsIcon icon={action.icon} strokeWidth={2} />
                  )}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function BarButton({
  action,
  disabled,
}: {
  action: SelectionAction
  disabled: boolean
}) {
  return (
    <Button
      variant="ghost"
      disabled={disabled || action.disabled}
      onClick={action.onSelect}
      className={cn(
        "shrink-0 rounded-full text-background hover:bg-background/15 hover:text-background",
        action.destructive &&
          "text-red-300 hover:text-red-200 dark:text-red-700 dark:hover:text-red-800"
      )}
    >
      {action.icon && (
        <HugeiconsIcon
          icon={action.icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
      )}
      {action.label}
    </Button>
  )
}

/**
 * Removes something with a way back: it's hidden at once, and only really
 * removed after 10 seconds (or as soon as the page is left) unless Undo is
 * pressed.
 */
export function undoable({
  message,
  hide,
  restore,
  commit,
}: {
  message: string
  /** Takes it off the screen now (the cached data, say). */
  hide: () => void
  /** Puts it back on Undo. */
  restore: () => void
  /** Really removes it. */
  commit: () => Promise<unknown>
}) {
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    window.removeEventListener("pagehide", finish)
    void commit().catch(() => {
      restore()
      toast.error("That didn't work, so it's back")
    })
  }
  hide()
  window.addEventListener("pagehide", finish)
  toast(message, {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return
        settled = true
        window.removeEventListener("pagehide", finish)
        restore()
      },
    },
    onAutoClose: finish,
    onDismiss: finish,
  })
}

/** For a page's own header: a Select button that starts select mode. */
export function SelectButton({
  selection,
  disabled,
}: {
  selection: Selection
  disabled?: boolean
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={() => selection.start()}
    >
      Select
    </Button>
  )
}

export function useSelectionKeepOnly(selection: Selection, ids: string[]) {
  const key = ids.join(",")
  const { keepOnly } = selection
  React.useEffect(() => {
    keepOnly(key ? key.split(",") : [])
  }, [key, keepOnly])
}
