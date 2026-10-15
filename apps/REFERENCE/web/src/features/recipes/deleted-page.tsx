import * as React from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import { formatRelativeDate } from "./format"
import { RecipeImage } from "./recipe-image"
import { useDeletedRecipes, useRecipeBulk } from "./use-recipes"

const daysLeft = (goneAt: string) =>
  Math.max(0, Math.ceil((Date.parse(goneAt) - Date.now()) / 86_400_000))

/**
 * Recently deleted recipes, kept for 30 days: restore one, or let it go for
 * good now.
 */
export function DeletedPage() {
  const deleted = useDeletedRecipes()
  const bulk = useRecipeBulk()
  const [emptying, setEmptying] = React.useState(false)
  const recipes = deleted.data ?? []

  const act = (
    action: "restore" | "purge",
    ids: string[],
    done: (changed: number) => string
  ) =>
    bulk.mutate(
      { action, ids },
      {
        onSuccess: ({ changed }) => toast.success(done(changed)),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "That didn't work"
          ),
      }
    )

  return (
    <>
      <PageHeader
        title="Recently deleted"
        description="Deleted recipes stay here for 30 days, then they're gone for good."
        actions={
          recipes.length > 0 && (
            <Button variant="outline" onClick={() => setEmptying(true)}>
              Empty it now
            </Button>
          )
        }
      />
      {deleted.isPending ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : !recipes.length ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground">Nothing's been deleted.</p>
          <Button variant="outline" asChild>
            <Link to="/recipes">Back to recipes</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid divide-y rounded-3xl border bg-card">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="flex items-center gap-3 p-3">
              <RecipeImage
                src={recipe.thumbnailUrl}
                alt=""
                className="size-14 shrink-0 rounded-xl [&_svg]:size-6"
              />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-medium">{recipe.name}</span>
                <span className="text-sm text-muted-foreground">
                  Deleted {formatRelativeDate(recipe.deletedAt)} ·{" "}
                  {daysLeft(recipe.goneAt)} days left
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={bulk.isPending}
                onClick={() =>
                  act("purge", [recipe.id], () => `${recipe.name} is gone`)
                }
              >
                Delete now
              </Button>
              <Button
                size="sm"
                disabled={bulk.isPending}
                onClick={() =>
                  act(
                    "restore",
                    [recipe.id],
                    () => `${recipe.name} is back in your recipes`
                  )
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={emptying} onOpenChange={setEmptying}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {recipes.length}{" "}
              {recipes.length === 1 ? "recipe" : "recipes"} for good?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their photos and history go too. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                act(
                  "purge",
                  recipes.map((recipe) => recipe.id),
                  (changed) =>
                    `${changed} ${changed === 1 ? "recipe" : "recipes"} deleted for good`
                )
              }
            >
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
