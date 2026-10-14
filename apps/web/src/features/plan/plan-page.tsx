import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Calendar03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { comingSoon } from "@/lib/coming-soon"

export function PlanPage() {
  return (
    <>
      <PageHeader title="Plan" description="What's for dinner this week." />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Nothing planned yet</EmptyTitle>
          <EmptyDescription>
            Pick recipes for the week, or let Mise suggest a week from what you
            like and what's already in the pantry.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => comingSoon("Week suggestions", 3)}>
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Suggest a week
            </Button>
            <Button
              variant="outline"
              onClick={() => comingSoon("Meal planning", 3)}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Add a meal
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </>
  )
}
