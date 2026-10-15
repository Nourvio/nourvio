import type { ImportBatch, ImportItem } from "@mise/shared"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link01Icon, Video01Icon } from "@hugeicons/core-free-icons"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { linkLabel } from "./format"
import { RecipeImage } from "./recipe-image"
import { useImportBatch, useImportBatchAction } from "./use-import-batches"

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** "Added 8 recipes. 1 you had already, 1 didn't work." */
function summary(batch: ImportBatch) {
  const count = (state: ImportItem["state"]) =>
    batch.items.filter((item) => item.state === state).length
  const parts = [
    count("added")
      ? `Added ${plural(count("added"), "recipe")}.`
      : "No new recipes.",
    count("duplicate") && `${count("duplicate")} you had already.`,
    count("failed") && `${count("failed")} didn't work.`,
    count("stopped") && `${count("stopped")} stopped.`,
  ]
  return parts.filter(Boolean).join(" ")
}

function stateText(item: ImportItem) {
  switch (item.state) {
    case "waiting":
      return item.kind === "video"
        ? "Waiting (videos go one at a time)"
        : "Waiting"
    case "importing":
      return item.kind === "video" ? "Watching the video…" : "Reading the page…"
    case "added":
      return "Added"
    case "duplicate":
      return "Already in your recipes"
    case "stopped":
      return "Stopped"
    case "failed":
      return item.error ?? "Didn't work"
  }
}

/**
 * How a bulk import is going (Recipes → Add recipe → Several links): each
 * link, live, with Try again for the ones that didn't work.
 */
export function ImportBatchPage() {
  const { id = "" } = useParams()
  const batch = useImportBatch(id)
  const action = useImportBatchAction(id)

  const run = (next: Parameters<typeof action.mutate>[0]) =>
    action.mutate(next, {
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "That didn't work"
        ),
    })

  if (batch.isPending) {
    return (
      <>
        <PageHeader title="Importing recipes" />
        <Skeleton className="h-60 rounded-3xl" />
      </>
    )
  }
  if (!batch.data) {
    return (
      <>
        <PageHeader title="Importing recipes" />
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground">
            That import isn't here any more.
          </p>
          <Button variant="outline" asChild>
            <Link to="/recipes">Back to recipes</Link>
          </Button>
        </div>
      </>
    )
  }

  const { items, finishedAt, tag } = batch.data
  const done = items.filter(
    (item) => item.state !== "waiting" && item.state !== "importing"
  ).length
  const waiting = items.filter((item) => item.state === "waiting").length
  const retryable = items.filter(
    (item) => item.state === "failed" || item.state === "stopped"
  ).length

  return (
    <>
      <PageHeader
        title={finishedAt ? "Import finished" : "Importing recipes"}
        description={
          finishedAt
            ? summary(batch.data)
            : `${done} of ${items.length} done. It carries on if you leave this page.`
        }
        actions={
          <>
            {!finishedAt && waiting > 0 && (
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => run({ type: "stop" })}
              >
                Stop
              </Button>
            )}
            {finishedAt && retryable > 0 && (
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => run({ type: "retry" })}
              >
                Try {retryable === 1 ? "it" : `the ${retryable}`} again
              </Button>
            )}
            <Button variant={finishedAt ? "default" : "ghost"} asChild>
              <Link to="/recipes">Recipes</Link>
            </Button>
          </>
        }
      />

      {!finishedAt && (
        <Progress
          value={(done / Math.max(items.length, 1)) * 100}
          className="mb-4"
          aria-label={`${done} of ${items.length} done`}
        />
      )}
      {tag && (
        <p className="mb-4 text-sm text-muted-foreground">
          New recipes are tagged{" "}
          <Link
            to={`/recipes?tag=${encodeURIComponent(tag)}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {tag}
          </Link>
          .
        </p>
      )}

      <ul className="grid divide-y rounded-3xl border bg-card">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 p-3">
            {item.recipe ? (
              <RecipeImage
                src={item.recipe.thumbnailUrl}
                alt=""
                className="size-12 shrink-0 rounded-xl [&_svg]:size-5"
              />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                {item.state === "importing" ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon
                    icon={item.kind === "video" ? Video01Icon : Link01Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                )}
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              {item.recipe ? (
                <Link
                  to={`/recipes/${item.recipe.slug}`}
                  className="truncate font-medium hover:underline"
                >
                  {item.recipe.name}
                </Link>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-medium hover:underline"
                >
                  {linkLabel(item.url)}
                </a>
              )}
              <span
                className={cn(
                  "text-sm text-muted-foreground",
                  item.state === "added" && "text-primary",
                  item.state === "failed" && "text-destructive"
                )}
              >
                {stateText(item)}
              </span>
            </div>
            {(item.state === "failed" || item.state === "stopped") && (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() => run({ type: "retry", itemId: item.id })}
              >
                Try again
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
