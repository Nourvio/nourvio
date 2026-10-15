import type { RecipeVersion } from "@mise/shared"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import { useRecipeVersions, useRestoreVersion } from "./use-recipes"

const SOURCE_LABELS: Record<RecipeVersion["source"], string> = {
  create: "Added",
  edit: "Edited",
  ai_cleanup: "Tidied up by AI",
  chat: "Changed in chat",
  restore: "Restored",
}

/** Every saved state of the recipe, newest first, with a way back to any of them. */
export function VersionsDialog({
  recipeId,
  open,
  onOpenChange,
}: {
  recipeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const versions = useRecipeVersions(recipeId, open)
  const restore = useRestoreVersion(recipeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Every saved version. Restoring one saves it as a new version, so
            nothing is lost.
          </DialogDescription>
        </DialogHeader>
        {versions.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : versions.isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the history.
          </p>
        ) : (
          <ol className="grid max-h-[60svh] gap-2 overflow-y-auto">
            {versions.data.map((version, index) => (
              <li
                key={version.id}
                className="flex items-center gap-3 rounded-2xl border p-3"
              >
                <div className="grid flex-1 gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {SOURCE_LABELS[version.source]}
                    {index === 0 && <Badge variant="secondary">current</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {index > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(version.id, {
                        onSuccess: () => {
                          toast.success("Restored that version")
                          onOpenChange(false)
                        },
                        onError: (error) =>
                          toast.error(
                            error instanceof ApiError
                              ? error.message
                              : "Couldn't restore it"
                          ),
                      })
                    }
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
