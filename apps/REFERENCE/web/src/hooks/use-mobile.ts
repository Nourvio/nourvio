import * as React from "react"

// Below Tailwind's `md` breakpoint (768px): phones get the bottom tabs and drawers.
const MOBILE_QUERY = "(max-width: 767px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}
