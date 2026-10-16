import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { useTheme, type Mode } from "./theme-context"

const MODE_OPTIONS = [
  { value: "light", labelKey: "theme.light", icon: Sun03Icon },
  { value: "dark", labelKey: "theme.dark", icon: Moon02Icon },
  { value: "system", labelKey: "theme.system", icon: ComputerIcon },
] as const

/** A compact icon button with a menu, for the top bar. */
export function ModeToggle() {
  const { t } = useTranslation()
  const { mode, resolvedMode, setMode } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("theme.change")} />
        }
      >
        <HugeiconsIcon
          icon={resolvedMode === "dark" ? Moon02Icon : Sun03Icon}
          strokeWidth={2}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme.appearance")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as Mode)}
          >
            {MODE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <HugeiconsIcon icon={option.icon} strokeWidth={2} />
                {t(option.labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A full-width segmented control, for Settings. */
export function ModeToggleGroup() {
  const { t } = useTranslation()
  const { mode, setMode } = useTheme()

  return (
    <ToggleGroup
      variant="outline"
      value={[mode]}
      onValueChange={(value) => {
        const next = value[0] as Mode | undefined
        if (next) setMode(next)
      }}
      aria-label={t("theme.mode")}
      className="w-full"
    >
      {MODE_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="flex-1"
        >
          <HugeiconsIcon icon={option.icon} strokeWidth={2} />
          {t(option.labelKey)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
