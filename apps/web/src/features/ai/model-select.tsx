import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { formatMoney, type ModelOption } from "./queries"

/** Picks a model from the ones some keys can run, or none for the default. */
export function ModelSelect({
  id,
  value,
  onChange,
  options,
  noneLabel,
  disabled,
  showSource,
}: {
  id?: string
  value: string | null
  onChange: (ref: string | null) => void
  options: ModelOption[]
  /** What none means here: "Each key's own default", say. */
  noneLabel: string
  disabled?: boolean
  /** Says which models run on the server's keys rather than one's own. */
  showSource?: boolean
}) {
  const { t, i18n } = useTranslation()
  const items = [
    { value: "", label: noneLabel },
    ...options.map((option) => {
      const name =
        showSource && option.source === "server"
          ? t("ai.models.onServer", { name: option.name })
          : option.name
      return {
        value: option.ref,
        label: option.price
          ? t("ai.models.priced", {
              name,
              input: formatMoney(option.price[0] ?? 0, i18n.language),
              output: formatMoney(option.price[1] ?? 0, i18n.language),
            })
          : name,
      }
    }),
  ]
  // A model picked before that no key can run now still shows.
  if (value && !options.some((option) => option.ref === value)) {
    items.push({ value, label: t("ai.models.gone", { ref: value }) })
  }
  return (
    <Select
      items={items}
      value={value ?? ""}
      onValueChange={(next) => onChange(next ? String(next) : null)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full sm:w-96">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value || "none"} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
