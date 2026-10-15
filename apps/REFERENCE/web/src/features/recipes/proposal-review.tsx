import * as React from "react"
import {
  RECIPE_SECTION_NAMES,
  RECIPE_SECTIONS,
  type Proposal,
  type RecipeDetails,
  type RecipeSection,
} from "@mise/shared"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { formatMinutes } from "./format"
import { useApplyProposal, useDismissProposal } from "./use-cleanup"

/**
 * The AI's suggestions for one recipe, section by section, each with a
 * checkbox. Applying keeps the ticked sections; dismissing drops them all.
 */
export function ProposalReview({
  proposal,
  onDone,
}: {
  proposal: Proposal
  onDone: () => void
}) {
  const sections = RECIPE_SECTIONS.filter((s) => s in proposal.after)
  const [chosen, setChosen] = React.useState<Set<RecipeSection>>(
    () => new Set(sections)
  )
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const busy = apply.isPending || dismiss.isPending

  function toggle(section: RecipeSection, on: boolean) {
    setChosen((current) => {
      const next = new Set(current)
      if (on) next.add(section)
      else next.delete(section)
      return next
    })
  }

  function onError(error: unknown) {
    toast.error(
      error instanceof ApiError ? error.message : "Couldn't save that"
    )
  }

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground">{proposal.summary}</p>
      <div className="grid gap-4">
        {sections.map((section) => (
          <section
            key={section}
            className={cn(
              "grid gap-3 rounded-2xl border p-4 transition-opacity",
              !chosen.has(section) && "opacity-60"
            )}
          >
            <label className="flex items-center gap-3 font-medium">
              <Checkbox
                checked={chosen.has(section)}
                disabled={busy}
                onCheckedChange={(on) => toggle(section, on === true)}
              />
              {RECIPE_SECTION_NAMES[section]}
            </label>
            <SectionDiff proposal={proposal} section={section} />
          </section>
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(proposal, {
              onSuccess: () => {
                toast("Suggestions dismissed")
                onDone()
              },
              onError,
            })
          }
        >
          {dismiss.isPending && <Spinner data-icon="inline-start" />}
          Dismiss all
        </Button>
        <Button
          disabled={busy || chosen.size === 0}
          onClick={() =>
            apply.mutate(
              { proposal, sections: [...chosen] },
              {
                onSuccess: () => {
                  toast.success("Recipe tidied", {
                    description: "The earlier version is in History.",
                  })
                  onDone()
                },
                onError,
              }
            )
          }
        >
          {apply.isPending && <Spinner data-icon="inline-start" />}
          {chosen.size === sections.length
            ? "Apply all"
            : `Apply ${chosen.size} of ${sections.length}`}
        </Button>
      </div>
    </div>
  )
}

export function SectionDiff({
  proposal,
  section,
}: {
  proposal: Proposal
  section: RecipeSection
}) {
  const { before, after } = proposal
  switch (section) {
    case "name":
      return (
        <p className="text-sm">
          <span className="text-muted-foreground line-through">
            {before.name}
          </span>{" "}
          → <span className="font-medium">{after.name}</span>
        </p>
      )
    case "description":
    case "notes":
      return <p className="text-sm whitespace-pre-line">{after[section]}</p>
    case "tags":
      return <TagDiff before={before.tags ?? []} after={after.tags ?? []} />
    case "details":
      return <DetailsDiff before={before.details!} after={after.details!} />
    case "ingredients":
    case "steps":
      return (
        <LinesDiff
          before={before[section] ?? []}
          after={after[section] ?? []}
        />
      )
  }
}

function TagDiff({ before, after }: { before: string[]; after: string[] }) {
  const lower = (tags: string[]) => new Set(tags.map((t) => t.toLowerCase()))
  const kept = lower(after)
  const had = lower(before)
  return (
    <div className="flex flex-wrap gap-1.5">
      {before
        .filter((tag) => !kept.has(tag.toLowerCase()))
        .map((tag) => (
          <Badge key={`-${tag}`} variant="outline" className="line-through">
            {tag}
          </Badge>
        ))}
      {after.map((tag) => (
        <Badge
          key={tag}
          variant={had.has(tag) ? "secondary" : "default"}
          title={had.has(tag) ? undefined : "New"}
        >
          {tag}
        </Badge>
      ))}
    </div>
  )
}

const DETAIL_LABELS: [keyof RecipeDetails, string][] = [
  ["servings", "Servings"],
  ["prepMinutes", "Prep"],
  ["cookMinutes", "Cook"],
  ["totalMinutes", "Total"],
]

function DetailsDiff({
  before,
  after,
}: {
  before: RecipeDetails
  after: RecipeDetails
}) {
  const show = (key: keyof RecipeDetails, value: number | null) =>
    value === null
      ? "—"
      : key === "servings"
        ? String(value)
        : formatMinutes(value)
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {DETAIL_LABELS.filter(([key]) => before[key] !== after[key]).map(
        ([key, label]) => (
          <React.Fragment key={key}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              <span className="font-medium">{show(key, after[key])}</span>
              <span className="text-muted-foreground"> (was missing)</span>
            </dd>
          </React.Fragment>
        )
      )}
    </dl>
  )
}

/** Now and suggested side by side; lines only on one side are marked. */
function LinesDiff({ before, after }: { before: string[]; after: string[] }) {
  const inAfter = new Set(after)
  const inBefore = new Set(before)
  return (
    // Side by side when there's room for it, stacked in the narrow chat panel.
    <div className="@container">
      <div className="grid gap-3 text-sm @md:grid-cols-2">
        <LineList
          title="Now"
          lines={before}
          isChanged={(line) => !inAfter.has(line)}
          changedClass="text-muted-foreground line-through decoration-muted-foreground/60"
        />
        <LineList
          title="Suggested"
          lines={after}
          isChanged={(line) => !inBefore.has(line)}
          changedClass="-mx-1.5 rounded-md bg-accent px-1.5 text-accent-foreground"
        />
      </div>
    </div>
  )
}

function LineList({
  title,
  lines,
  isChanged,
  changedClass,
}: {
  title: string
  lines: string[]
  isChanged: (line: string) => boolean
  changedClass: string
}) {
  return (
    <div className="grid content-start gap-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="grid gap-1.5">
        {lines.map((line, index) =>
          line.startsWith("#") ? (
            <li key={index} className="pt-1 font-medium">
              {line.replace(/^#+\s*/, "")}
            </li>
          ) : (
            <li key={index} className={cn(isChanged(line) && changedClass)}>
              {line}
            </li>
          )
        )}
      </ul>
    </div>
  )
}
