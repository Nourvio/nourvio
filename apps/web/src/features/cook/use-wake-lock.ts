import * as React from "react"

/**
 * Keeps the screen on while mounted (Screen Wake Lock API). The browser drops
 * the lock when the tab is hidden, so it's requested again on return.
 * Returns whether the lock is currently held.
 */
export function useWakeLock() {
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    if (!("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    async function request() {
      try {
        const next = await navigator.wakeLock.request("screen")
        if (cancelled) {
          await next.release()
          return
        }
        lock = next
        setActive(true)
        next.addEventListener("release", () => setActive(false))
      } catch {
        setActive(false)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request()
    }

    void request()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      void lock?.release()
    }
  }, [])

  return active
}
