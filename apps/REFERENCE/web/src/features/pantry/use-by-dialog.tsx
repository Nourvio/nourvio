import * as React from "react"
import { addDays } from "@mise/shared"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { monthDay, today } from "@/features/plan/dates"

const QUICK: [label: string, days: number][] = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["In a week", 7],
]

/** When selected pantry things need using by, or no date at all. */
export function UseByDialog({
  count,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (useBy: string | null) => void
}) {
  const [date, setDate] = React.useState(() => addDays(today(), 3))
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Use ${count === 1 ? "it" : `these ${count}`} by`}
      description="They move up to Use soon as the day gets close."
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(([label, days]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onPick(addDays(today(), days))}
            >
              {label}
            </Button>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor="bulk-use-by">Or a day</FieldLabel>
          <Input
            id="bulk-use-by"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => onPick(null)}>
            No date
          </Button>
          <Button disabled={!date} onClick={() => onPick(date)}>
            {date ? `Use by ${monthDay(date)}` : "Use by"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
