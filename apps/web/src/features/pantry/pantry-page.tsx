import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, FridgeIcon } from "@hugeicons/core-free-icons"

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

export function PantryPage() {
  return (
    <>
      <PageHeader
        title="Pantry"
        description="What's on hand, and what to use soon."
      />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FridgeIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Nothing in the pantry yet</EmptyTitle>
          <EmptyDescription>
            Items you check off at the store land here, and cooking a meal uses
            them up.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => comingSoon("The pantry", 4)}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Add what you have
          </Button>
        </EmptyContent>
      </Empty>
    </>
  )
}
