import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { STORE_SECTIONS } from "@mise/shared"
import { Link } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Panel, WithAside } from "@/components/layout/page-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useList, useUpdateListItem } from "@/features/list/use-list"
import { cn } from "@/lib/utils"

/** An item's search at Costco Same-Day (run by Instacart); it asks you to sign in first if you aren't. */
export function costcoSearchUrl(name: string) {
  return `https://sameday.costco.com/store/costco/s?k=${encodeURIComponent(name)}`
}

/**
 * The list for Costco. Costco has no way for apps to fill a cart, so each
 * item links to its search at Costco Same-Day, and checks off here.
 */
export function CostcoPage() {
  const list = useList()
  const update = useUpdateListItem()
  const items = list.data ?? []
  const toGet = items.filter((item) => !item.checked)
  const got = items.filter((item) => item.checked)
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    items: toGet.filter((item) => item.sectionId === section.id),
  })).filter((section) => section.items.length)

  return (
    <>
      <Link
        to="/list"
        className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4"
        />
        List
      </Link>
      <PageHeader
        title="Shop at Costco"
        description="Each item opens its search at Costco Same-Day. Add what you want there, then check it off here."
      />
      {list.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : !toGet.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing left to get</EmptyTitle>
            <EmptyDescription>
              Everything on the list is checked off.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <WithAside
          aside={
            <Panel title="How it works">
              <p className="text-sm text-muted-foreground">
                Costco Same-Day is run by Instacart, and neither lets apps fill
                a cart, so Mise opens each item's search for you. Sign in there
                once with your Costco membership and the links go straight to
                the results.
              </p>
              <p className="text-sm text-muted-foreground">
                Costco packs are big: one usually covers more than a recipe
                needs.
              </p>
              <p className="text-sm">
                {got.length} of {items.length} checked off
              </p>
            </Panel>
          }
        >
          {sections.map((section) => (
            <section key={section.id} className="grid gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {section.name}
              </h2>
              <ul className="divide-y rounded-2xl border bg-card text-card-foreground">
                {section.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <Checkbox
                      className="size-6 rounded-md"
                      checked={item.checked}
                      aria-label={`Check off ${item.name}`}
                      onCheckedChange={(on) =>
                        update.mutate({ id: item.id, checked: on === true })
                      }
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        item.checked && "text-muted-foreground line-through"
                      )}
                    >
                      <span className="inline-block font-medium first-letter:uppercase">
                        {item.name}
                      </span>
                      {item.amount && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {item.amount}
                        </span>
                      )}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={costcoSearchUrl(item.name)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Find at Costco
                        <HugeiconsIcon
                          icon={LinkSquare02Icon}
                          strokeWidth={2}
                          data-icon="inline-end"
                        />
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </WithAside>
      )}
    </>
  )
}
