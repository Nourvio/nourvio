import * as React from "react"
import { THEME_PRESETS, type NightTheme, type WeekThemes } from "@mise/shared"
import { toast } from "sonner"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError } from "@/lib/api"

import { useUpdateHousehold } from "./use-household"

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

/** A Select value for a theme: none, one of the presets, or a tag of your own. */
function valueOf(theme: NightTheme | null) {
  if (!theme) return "none"
  const preset = THEME_PRESETS.findIndex(
    (p) => p.kind === theme.kind && p.name === theme.name && p.tag === theme.tag
  )
  return preset === -1 ? "custom" : `preset:${preset}`
}

/** A theme for each night's dinner, which Fill the week and the autopilot follow. */
export function ThemeNightsField({
  themes,
  weekStart,
}: {
  themes: WeekThemes
  weekStart: 0 | 1
}) {
  const update = useUpdateHousehold()
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7)

  function save(weekday: number, theme: NightTheme | null) {
    const next = [...themes]
    next[weekday] = theme
    update.mutate(
      { themes: next },
      {
        onSuccess: () => toast.success("Theme nights updated"),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  return (
    <Field>
      <FieldLabel>Theme nights</FieldLabel>
      <div className="divide-y rounded-2xl border">
        {order.map((weekday) => (
          <NightRow
            key={weekday}
            day={DAYS[weekday]!}
            theme={themes[weekday] ?? null}
            disabled={update.isPending}
            onChange={(theme) => save(weekday, theme)}
          />
        ))}
      </div>
      <FieldDescription>
        Fill the week and the autopilot only suggest dinners that fit the night:
        tagged or named for it, vegetarian for meatless, never made for
        something new. Leftovers and eat-out nights stay empty.
      </FieldDescription>
    </Field>
  )
}

function NightRow({
  day,
  theme,
  disabled,
  onChange,
}: {
  day: string
  theme: NightTheme | null
  disabled: boolean
  onChange: (theme: NightTheme | null) => void
}) {
  const value = valueOf(theme)
  const [custom, setCustom] = React.useState(value === "custom")
  const [tag, setTag] = React.useState(
    theme?.kind === "tag" && value === "custom" ? theme.tag! : ""
  )
  const id = React.useId()

  function pick(next: string) {
    if (next === "custom") {
      setCustom(true)
      return
    }
    setCustom(false)
    onChange(
      next === "none"
        ? null
        : THEME_PRESETS[Number(next.replace("preset:", ""))]!
    )
  }

  function saveTag() {
    const word = tag.trim()
    if (!word || (theme?.kind === "tag" && theme.tag === word)) return
    onChange({
      kind: "tag",
      name: `${word[0]!.toUpperCase()}${word.slice(1)}`,
      tag: word.toLowerCase(),
    })
  }

  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[7rem_minmax(0,20rem)]">
      <label htmlFor={id} className="text-sm font-medium">
        {day}
      </label>
      <Select
        value={custom ? "custom" : value}
        onValueChange={pick}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No theme</SelectItem>
          <SelectSeparator />
          {THEME_PRESETS.map((preset, index) => (
            <SelectItem key={preset.name} value={`preset:${index}`}>
              {preset.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">A tag of your own…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <form
          className="col-start-2"
          onSubmit={(event) => {
            event.preventDefault()
            saveTag()
          }}
        >
          <Input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onBlur={saveTag}
            placeholder="A tag, like curry or burgers"
            aria-label={`${day}'s tag`}
            autoFocus={!tag}
            maxLength={40}
          />
        </form>
      )}
    </div>
  )
}
