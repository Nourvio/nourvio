import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { importLink } from "../../../../services/recipes/import/import-link.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { RECIPE } from "../../../schemas/examples.ts"
import { RecipeSchema } from "../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const ImportResultSchema = z
  .object({
    recipe: RecipeSchema,
    duplicate: z.boolean().openapi({
      description:
        "True when the link was imported before: this is that recipe, unchanged.",
    }),
  })
  .openapi("ImportResult", { example: { recipe: RECIPE, duplicate: false } })

const route = createRoute({
  method: "post",
  path: "/recipes/import",
  operationId: "importRecipe",
  tags: ["Recipes"],
  summary: "Add a recipe from a link",
  description:
    "Reads the recipe data most recipe sites put in their pages, and its photo. A link the household imported before gives back that recipe, unless `force` is set. Pages without recipe data, and video links, can't be imported yet.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              url: z
                .string()
                .trim()
                .min(1, "Paste a link to a recipe.")
                .max(2000, "That link is too long."),
              force: z.boolean().optional().openapi({
                description: "Import it again even if the household has it.",
              }),
            })
            .openapi({ example: { url: "https://example.com/lemon-chicken" } }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(ImportResultSchema, "Added."),
    200: jsonResponse(ImportResultSchema, "Already in the library."),
    400: errorResponse("Not a link Merran can fetch."),
    422: errorResponse("The page has no recipe data, or it's a video."),
    502: errorResponse("The site couldn't be reached, or turned Merran away."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { fetcher, files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { url, force } = c.req.valid("json")
    const result = await importLink(
      em,
      { fetcher, files },
      { householdId, userId, url, force }
    )
    return c.json(result, result.duplicate ? 200 : 201)
  })
}
