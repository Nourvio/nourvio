import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import {
  CLEANUP_SECTION_NAMES,
  CLEANUP_SECTIONS,
  type Proposal,
} from "@mise/shared"
import { Link } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"

import { formatRelativeDate } from "./format"
import { ProposalReview } from "./proposal-review"
import { usePendingProposals } from "./use-cleanup"

/** Tidy-up suggestions waiting across the library, one recipe at a time. */
export function ReviewPage() {
  const proposals = usePendingProposals()
  const [open, setOpen] = React.useState<Proposal | null>(null)

  return (
    <>
      <PageHeader
        title="Review"
        description="Tidy-up suggestions waiting for you. Nothing changes until you apply it."
      />
      {proposals.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : proposals.isError ? (
        <p className="text-muted-foreground">Couldn't load the suggestions.</p>
      ) : proposals.data.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>
              Suggestions from tidying a recipe, or the whole library, show up
              here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link to="/recipes">Back to recipes</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {proposals.data.map((proposal) => (
            <Item key={proposal.id} variant="outline">
              <ItemContent>
                <ItemTitle>
                  <Link
                    to={`/recipes/${proposal.recipe.slug}`}
                    className="hover:underline"
                  >
                    {proposal.recipe.name}
                  </Link>
                </ItemTitle>
                <ItemDescription>{proposal.summary}</ItemDescription>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CLEANUP_SECTIONS.filter((s) => s in proposal.after).map(
                    (section) => (
                      <Badge key={section} variant="secondary">
                        {CLEANUP_SECTION_NAMES[section]}
                      </Badge>
                    )
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeDate(proposal.createdAt)}
                  </span>
                </div>
              </ItemContent>
              <ItemActions>
                <Button onClick={() => setOpen(proposal)}>Review</Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.recipe.name}</DialogTitle>
                <DialogDescription>
                  Keep what you like. The current version stays in History.
                </DialogDescription>
              </DialogHeader>
              <ProposalReview
                key={open.id}
                proposal={open}
                onDone={() => setOpen(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
