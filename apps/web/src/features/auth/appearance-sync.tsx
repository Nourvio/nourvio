import * as React from "react"
import type { Appearance, User } from "@mise/shared"

import { useTheme } from "@/components/theme/theme-context"

import { useUpdateMe } from "./use-session"

/**
 * Keeps the theme and the account in step: on sign-in the account's saved
 * appearance is applied to this device, and later changes made with the mode
 * and palette controls are saved back to the account.
 */
export function AppearanceSync({ user }: { user: User }) {
  const { mode, palette, setMode, setPalette } = useTheme()
  const { mutate: saveAppearance } = useUpdateMe()
  const syncedUserId = React.useRef<string | null>(null)
  const saved = React.useRef<Appearance>(user.appearance)
  // The account's appearance we've asked the theme to switch to, until it has.
  const applying = React.useRef<Appearance | null>(null)

  React.useEffect(() => {
    if (syncedUserId.current === user.id) return
    syncedUserId.current = user.id
    saved.current = user.appearance
    const target = user.appearance
    if (target.mode !== mode || target.palette !== palette) {
      applying.current = target
      setMode(target.mode)
      setPalette(target.palette)
    }
  }, [user.id, user.appearance, mode, palette, setMode, setPalette])

  React.useEffect(() => {
    const target = applying.current
    if (target) {
      if (mode === target.mode && palette === target.palette) {
        applying.current = null
      }
      return
    }
    if (mode === saved.current.mode && palette === saved.current.palette) return
    saved.current = { mode, palette }
    saveAppearance({ appearance: { mode, palette } })
  }, [mode, palette, saveAppearance])

  return null
}
