import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatRelativeDate } from "@/features/recipes/format"
import { ApiError } from "@/lib/api"

import { useCheckForUpdates, useUpdates } from "./use-updates"

/** The changes shown before "and N more". */
const SHOWN = 8

/** "Oct 14, 9:15 PM" */
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

/** Server admin: whether GitHub has a newer Nourvio, what's in it, and how to get it. */
export function UpdatesCard() {
  const updates = useUpdates()
  const check = useCheckForUpdates()
  const status = updates.data

  const checkNow = () =>
    check.mutate(undefined, {
      onSuccess: (found) =>
        found.state === "available"
          ? toast.success("There's an update")
          : found.state === "current"
            ? toast.success("Nourvio is up to date")
            : toast.error(found.reason ?? "Couldn't check for updates"),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't check"
        ),
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>
          Nourvio checks GitHub every few hours for changes since this server
          was built.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!status ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span
                className={
                  status.state === "available"
                    ? "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
                    : "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground"
                }
              >
                <HugeiconsIcon
                  icon={
                    status.state === "available"
                      ? SparklesIcon
                      : status.state === "current"
                        ? CheckmarkCircle02Icon
                        : Alert02Icon
                  }
                  strokeWidth={2}
                />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="font-medium">
                  {status.state === "available"
                    ? `An update is ready: ${status.changes.length} ${status.changes.length === 1 ? "change" : "changes"}`
                    : status.state === "current"
                      ? "Nourvio is up to date"
                      : "Can't tell whether there's an update"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {status.state === "unknown"
                    ? status.reason
                    : [
                        status.builtAt && `Built ${when(status.builtAt)}`,
                        status.running && `from ${status.running.slice(0, 7)}`,
                        status.checkedAt &&
                          `checked ${formatRelativeDate(status.checkedAt).toLowerCase()}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
            </div>

            {status.state === "available" && (
              <>
                <ul className="grid gap-1.5 rounded-2xl bg-secondary/60 p-4 text-sm">
                  {status.changes.slice(0, SHOWN).map((change) => (
                    <li key={change.sha} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span className="min-w-0">{change.title}</span>
                    </li>
                  ))}
                  {status.changes.length > SHOWN && (
                    <li className="text-muted-foreground">
                      and {status.changes.length - SHOWN} more
                    </li>
                  )}
                </ul>
                <div className="grid gap-1 text-sm">
                  <p className="font-medium">To update</p>
                  <p className="text-muted-foreground">
                    In Dockge, open the Nourvio stack and press <b>Update</b>{" "}
                    (or stop and start it). Nourvio rebuilds from GitHub and
                    restarts in a few minutes; database changes run by
                    themselves.
                  </p>
                  {status.setupFiles.includes("compose.yaml") && (
                    <SetupNote>
                      It also changes compose.yaml, which your Dockge stack
                      keeps its own copy of. Compare the two before updating.
                    </SetupNote>
                  )}
                  {status.setupFiles.includes(".env.example") && (
                    <SetupNote>
                      It also changes .env.example: there may be a new setting
                      worth adding to your .env.
                    </SetupNote>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={check.isPending}
                onClick={checkNow}
              >
                {check.isPending && <Spinner data-icon="inline-start" />}
                Check now
              </Button>
              {status.compareUrl && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={status.compareUrl} target="_blank" rel="noreferrer">
                    See every change on GitHub
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SetupNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-amber-700 dark:text-amber-400">
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{children}</span>
    </p>
  )
}
