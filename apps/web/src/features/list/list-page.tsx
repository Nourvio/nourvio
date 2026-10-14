import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ShoppingBasket01Icon } from "@hugeicons/core-free-icons"

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

export function ListPage() {
  return (
    <>
      <PageHeader title="List" description="Everything to pick up this week." />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={ShoppingBasket01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Your list is empty</EmptyTitle>
          <EmptyDescription>
            Build it from this week's plan, or add things as you think of them.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => comingSoon("Lists from the plan", 3)}>
              Build from the plan
            </Button>
            <Button
              variant="outline"
              onClick={() => comingSoon("Shopping lists", 3)}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Add an item
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </>
  )
}
