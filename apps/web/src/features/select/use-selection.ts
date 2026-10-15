import * as React from "react"

/**
 * Select mode for a page of things (recipes, list items, pantry items,
 * meals): which ids are picked. Escape or leaving the page ends it. While
 * it's on, the page is marked so the chat button steps aside for the
 * action bar.
 */
export function useSelection() {
  const [selecting, setSelecting] = React.useState(false)
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())

  const done = React.useCallback(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [])

  React.useEffect(() => {
    if (!selecting) return
    const root = document.documentElement
    root.dataset.selecting = "true"
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) {
        done()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      delete root.dataset.selecting
      window.removeEventListener("keydown", onKey)
    }
  }, [selecting, done])

  const start = React.useCallback((id?: string) => {
    setSelecting(true)
    setPicked(id ? new Set([id]) : new Set())
  }, [])
  const toggle = React.useCallback(
    (id: string) =>
      setPicked((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    []
  )
  const toggleAll = React.useCallback(
    (ids: string[]) =>
      setPicked((current) =>
        ids.length && ids.every((id) => current.has(id))
          ? new Set()
          : new Set(ids)
      ),
    []
  )
  const keepOnly = React.useCallback(
    (ids: string[]) =>
      setPicked((current) => {
        const there = new Set(ids)
        const next = new Set([...current].filter((id) => there.has(id)))
        return next.size === current.size ? current : next
      }),
    []
  )

  return {
    selecting,
    picked,
    count: picked.size,
    isPicked: (id: string) => picked.has(id),
    /** Starts selecting, with this one picked when given (a long-press). */
    start,
    toggle,
    /** Picks all of these, or none when they're all picked already. */
    toggleAll,
    /** Leaves out what's no longer there (removed, or filtered away). */
    keepOnly,
    done,
  }
}

export type Selection = ReturnType<typeof useSelection>

/**
 * A long press (half a second, without moving) on a touch screen, which
 * starts selecting with that item. A mouse uses the Select button.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = React.useRef<number | null>(null)
  const start = React.useRef<{ x: number; y: number } | null>(null)
  const fired = React.useRef(false)

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  if (!enabled) return {}
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") return
      fired.current = false
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(10)
        onLongPress()
      }, 500)
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!start.current) return
      const moved =
        Math.abs(event.clientX - start.current.x) +
        Math.abs(event.clientY - start.current.y)
      if (moved > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (start.current || fired.current) event.preventDefault()
    },
    /** Swallows the click that ends a long press, so it doesn't open the item. */
    onClickCapture: (event: React.MouseEvent) => {
      if (fired.current) {
        event.preventDefault()
        event.stopPropagation()
        fired.current = false
      }
    },
  }
}
