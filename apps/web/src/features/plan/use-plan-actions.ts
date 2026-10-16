import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import type { PlanEntry, PlanSnapshot } from "./queries"

type NewEntry = Schemas["NewPlanEntry"]
type Changes = Schemas["PlanEntryChanges"]
type Bulk = Schemas["PlanBulk"]

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Changes to the plan, each followed by the plan and recipes loading again.
 * Taking meals off says so with an Undo that really puts them back.
 */
export function usePlanActions() {
  const { t } = useTranslation()
  const refreshRecipes = useRefreshRecipes()

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      const done = await work()
      // The plan, and recipes: cooking changes when they were last made.
      await refreshRecipes()
      return done
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    }
  }

  const restore = (entries: PlanSnapshot[]) =>
    run(() => unwrap(api.POST("/api/plan/restore", { body: { entries } })))

  /**
   * Says what happened, with Undo putting things back as they were, for
   * long enough to find it.
   */
  const undoable = (message: string, before: PlanSnapshot[]) =>
    toast.success(message, {
      duration: UNDO_MS,
      action: { label: t("plan.undo"), onClick: () => void restore(before) },
    })

  const nameOf = (entry: Pick<PlanEntry, "recipe" | "note">) =>
    entry.recipe?.name ?? entry.note ?? ""

  return {
    add: (body: NewEntry) =>
      run(() => unwrap(api.POST("/api/plan/entries", { body }))),

    change: (entry: PlanEntry, changes: Changes) =>
      run(() =>
        unwrap(
          api.PATCH("/api/plan/entries/{entryId}", {
            params: { path: { entryId: entry.id } },
            body: changes,
          })
        )
      ),

    async remove(entry: PlanEntry) {
      const before = await run(() =>
        unwrap(
          api.DELETE("/api/plan/entries/{entryId}", {
            params: { path: { entryId: entry.id } },
          })
        )
      )
      if (before) undoable(t("plan.removed", { name: nameOf(entry) }), [before])
    },

    async bulk(ids: string[], action: Omit<Bulk, "ids">) {
      const done = await run(() =>
        unwrap(api.POST("/api/plan/entries/bulk", { body: { ids, ...action } }))
      )
      if (!done) return false
      const count = done.before.length
      undoable(
        action.action === "remove"
          ? t("plan.bulk.removed", { count })
          : action.action === "move"
            ? t("plan.bulk.moved", { count })
            : t("plan.bulk.marked", { count }),
        done.before
      )
      return true
    },

    async repeat(week: string) {
      const done = await run(() =>
        unwrap(api.POST("/api/plan/repeat", { body: { week } }))
      )
      if (!done) return
      const ids = done.entries.map((entry) => entry.id)
      if (ids.length === 0) {
        toast(t("plan.repeatedNone"))
        return
      }
      toast.success(t("plan.repeated", { count: ids.length }), {
        duration: UNDO_MS,
        action: {
          label: t("plan.undo"),
          onClick: () =>
            void run(() =>
              unwrap(
                api.POST("/api/plan/entries/bulk", {
                  body: { ids, action: "remove" },
                })
              )
            ),
        },
      })
    },

    async clear(week: string) {
      const done = await run(() =>
        unwrap(api.POST("/api/plan/clear", { body: { week } }))
      )
      if (!done) return
      if (done.before.length === 0) toast(t("plan.clearedNone"))
      else
        undoable(t("plan.cleared", { count: done.before.length }), done.before)
    },
  }
}
