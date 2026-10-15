import * as React from "react"
import { toast } from "sonner"

/**
 * Things removed with a way back, hidden until they're really gone. Kept
 * apart from the fetched data, so a refresh in the meantime (someone else
 * changing the list, say) doesn't bring them back.
 */
const hidden = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether something is waiting to be removed, so leave it off the page. */
export function useHidden() {
  React.useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  )
  return React.useCallback((id: string) => hidden.has(id), [])
}

/**
 * Removes things with a way back: they're hidden at once, and only really
 * removed after 10 seconds (or as soon as the page is left) unless Undo is
 * pressed. `commit` should resolve once the page's data has caught up.
 */
export function undoable({
  message,
  ids,
  commit,
}: {
  message: string
  ids: string[]
  commit: () => Promise<unknown>
}) {
  const show = () => {
    for (const id of ids) hidden.delete(id)
    changed()
  }
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    window.removeEventListener("pagehide", finish)
    commit().then(show, () => {
      show()
      toast.error("That didn't work, so it's back")
    })
  }
  for (const id of ids) hidden.add(id)
  changed()
  window.addEventListener("pagehide", finish)
  toast(message, {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return
        settled = true
        window.removeEventListener("pagehide", finish)
        show()
      },
    },
    onAutoClose: finish,
    onDismiss: finish,
  })
}
