import type { AddCookNoteInput, CookNote, Recipe } from "@mise/shared"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import { editChanges } from "../chat/tools.ts"
import type { Db } from "../db/client.ts"
import { cookNotes, users } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { createProposal, recipeText } from "./proposals.ts"
import {
  findRecipeRow,
  getRecipe,
  setRecipeFields,
  toInput,
} from "./recipes.ts"

const NOTE_SYSTEM = `A cook left a note after making this recipe. Turn the note into changes to the recipe, so next time it comes out the way they wanted.
- Change only what the note is about: an amount, a time or temperature in a step, a missing step. Keep every other line word for word, including "# Section" lines.
- Give the full list for any list you change; null for anything that stays the same.
- A tip that isn't a change to amounts or steps ("great with rice", "use the big pan") goes in the notes: keep the existing notes and add a short line.
- If the note is only an opinion ("delicious", "the kids loved it"), or the recipe already says it, set change to false.
- Write the summary as one short sentence about what changes, like "Adds a teaspoon of salt and 5 more minutes in the oven."`

const noteEdit = z.object({
  change: z.boolean().describe("Whether the note calls for a change"),
  summary: z.string(),
  servings: z.number().nullable(),
  ingredients: z.array(z.string()).nullable(),
  steps: z.array(z.string()).nullable(),
  notes: z.string().nullable(),
})

export async function listCookNotes(
  db: Db,
  householdId: string,
  idOrSlug: string
): Promise<CookNote[]> {
  const recipe = await findRecipeRow(db, householdId, idOrSlug)
  const rows = await db
    .select({
      id: cookNotes.id,
      rating: cookNotes.rating,
      note: cookNotes.note,
      by: users.displayName,
      createdAt: cookNotes.createdAt,
    })
    .from(cookNotes)
    .leftJoin(users, eq(cookNotes.userId, users.id))
    .where(
      and(
        eq(cookNotes.householdId, householdId),
        eq(cookNotes.recipeId, recipe.id)
      )
    )
    .orderBy(desc(cookNotes.createdAt))
    .limit(50)
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Saves how cooking went. Stars become the recipe's rating; a note, with AI
 * set up, is turned into a suggested change in the background, waiting on
 * the recipe page for review.
 */
export async function addCookNote(
  db: Db,
  ai: AiService,
  actor: { userId: string; householdId: string },
  idOrSlug: string,
  input: AddCookNoteInput
) {
  const recipe = await getRecipe(db, actor.householdId, idOrSlug)
  const note = input.note?.trim() || null
  const [row] = await db
    .insert(cookNotes)
    .values({
      householdId: actor.householdId,
      recipeId: recipe.id,
      userId: actor.userId,
      rating: input.rating,
      note,
    })
    .returning()
  if (input.rating !== null) {
    await setRecipeFields(db, actor.householdId, recipe.id, {
      rating: input.rating,
    })
  }
  const suggesting = Boolean(note) && (await ai.status()).available
  if (suggesting) {
    void suggestFromNote(db, ai, actor, recipe, note!).catch((error: Error) =>
      console.warn(
        `Couldn't turn a note on ${recipe.name} into a change:`,
        error.message
      )
    )
  }
  const [by] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actor.userId))
  return {
    note: {
      id: row!.id,
      rating: row!.rating,
      note: row!.note,
      by: by?.name ?? null,
      createdAt: row!.createdAt.toISOString(),
    },
    suggesting,
  }
}

export async function deleteCookNote(
  db: Db,
  householdId: string,
  idOrSlug: string,
  noteId: string
) {
  const recipe = await findRecipeRow(db, householdId, idOrSlug)
  const deleted = z.uuid().safeParse(noteId).success
    ? await db
        .delete(cookNotes)
        .where(
          and(
            eq(cookNotes.id, noteId),
            eq(cookNotes.recipeId, recipe.id),
            eq(cookNotes.householdId, householdId)
          )
        )
        .returning({ id: cookNotes.id })
    : []
  if (!deleted.length) throw new HttpError(404, "That note isn't there")
}

/** The note as a suggested change to the recipe, or nothing if it's just an opinion. */
export async function suggestFromNote(
  db: Db,
  ai: AiService,
  actor: AiActor & { householdId: string },
  recipe: Recipe,
  note: string
) {
  const result = await ai.extract("cleanup", actor, {
    system: NOTE_SYSTEM,
    parts: [
      {
        type: "text",
        text: `${recipeText(toInput(recipe))}\n\nThe cook's note:\n${note}`,
      },
    ],
    schema: noteEdit,
    schemaName: "note_edit",
  })
  if (!result.change) return null
  const { before, after } = editChanges(recipe, {
    name: null,
    description: null,
    tags: null,
    servings: result.servings,
    ingredients: result.ingredients,
    steps: result.steps,
    notes: result.notes,
  })
  if (!Object.keys(after).length) return null
  return createProposal(db, {
    householdId: actor.householdId,
    kind: "recipe_edit",
    recipeId: recipe.id,
    payload: {
      summary: (result.summary.trim() || "From your note").slice(0, 300),
      before,
      after,
      fromNote: note.slice(0, 1000),
    },
    userId: actor.userId,
    conversationId: null,
  })
}
