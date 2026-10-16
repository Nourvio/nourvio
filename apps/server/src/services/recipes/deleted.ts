import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { AppError } from "../../core/errors.ts"
import { summarize } from "./recipes.ts"
import { pruneTags, tagsOf } from "./tags.ts"

/** How long a recipe stays in Recently deleted. */
export const KEEP_DELETED_DAYS = 30

const DAY = 24 * 60 * 60 * 1000
const SEE_DELETED = { filters: { [NOT_DELETED_FILTER]: false } }

const goneAt = (deletedAt: Date) =>
  new Date(deletedAt.getTime() + KEEP_DELETED_DAYS * DAY)

/**
 * Deletes for good what's been in Recently deleted long enough. Runs before
 * each listing, until the job runner does it daily.
 */
async function purgeExpired(em: EntityManager) {
  await em.nativeDelete(
    Recipe,
    { deletedAt: { $lt: new Date(Date.now() - KEEP_DELETED_DAYS * DAY) } },
    SEE_DELETED
  )
}

/** What's in Recently deleted, latest first. */
export async function listDeleted(em: EntityManager) {
  await purgeExpired(em)
  const recipes = await em.find(
    Recipe,
    { deletedAt: { $ne: null } },
    { ...SEE_DELETED, orderBy: { deletedAt: "desc", id: "asc" } }
  )
  const tags = await tagsOf(
    em,
    recipes.map((recipe) => recipe.id)
  )
  return recipes.map((recipe) => ({
    ...summarize(recipe, tags.get(recipe.id) ?? []),
    deletedAt: recipe.deletedAt!.toISOString(),
    goneAt: goneAt(recipe.deletedAt!).toISOString(),
  }))
}

async function findDeleted(em: EntityManager, recipeId: string) {
  const recipe = await em.findOne(
    Recipe,
    { id: recipeId, deletedAt: { $ne: null } },
    SEE_DELETED
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe in Recently deleted."
    )
  }
  return recipe
}

/** Puts a recipe back where it was. */
export async function restoreDeleted(em: EntityManager, recipeId: string) {
  const recipe = await findDeleted(em, recipeId)
  recipe.deletedAt = null
  await em.flush()
  return recipe.slug
}

/** Deletes a recipe in Recently deleted for good, with its lines and versions. */
export async function deleteForGood(em: EntityManager, recipeId: string) {
  const recipe = await findDeleted(em, recipeId)
  await em.remove(recipe).flush()
  await pruneTags(em)
}

/** Deletes everything in Recently deleted for good. */
export async function emptyDeleted(em: EntityManager) {
  await em.nativeDelete(Recipe, { deletedAt: { $ne: null } }, SEE_DELETED)
  await pruneTags(em)
}
