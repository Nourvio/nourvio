import { z } from "@hono/zod-openapi"
import { IDS } from "./examples.ts"

// Importing from other apps: what a file is before its import starts, and
// connecting to a Mealie.

export const ImportFileSchema = z
  .object({
    id: z.string().openapi({
      description:
        "Start its import at /households/current/import/files/{fileId}/start.",
    }),
    app: z.enum(["mealie", "paprika"]),
    what: z.enum(["backup", "recipes"]).openapi({
      description: "A whole backup, or recipes exported from the app.",
    }),
    recipes: z.number().int(),
    alreadyHere: z.number().int().openapi({
      description:
        "Of those, how many an earlier import brought in. They're skipped.",
    }),
    groups: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          recipes: z.number().int(),
        })
      )
      .openapi({
        description:
          "A Mealie backup's groups, when there's more than one to choose from.",
      }),
  })
  .openapi("ImportFile", {
    example: {
      id: IDS.importFile,
      app: "mealie",
      what: "backup",
      recipes: 312,
      alreadyHere: 0,
      groups: [
        { id: IDS.mealieGroup, name: "Home", recipes: 298 },
        { id: IDS.otherMealieGroup, name: "Grandma", recipes: 14 },
      ],
    },
  })

export const ImportFileParam = z.object({
  fileId: z.uuid().openapi({ param: { name: "fileId", in: "path" } }),
})

export const StartImportFileSchema = z
  .object({
    group: z.string().nullish().openapi({
      description:
        "Which of a Mealie backup's groups to import. All of them if left out.",
    }),
  })
  .openapi("StartImportFile", { example: { group: IDS.mealieGroup } })

export const MealieConnectionSchema = z
  .object({
    url: z
      .url({
        protocol: /^https?$/,
        error: "Use Mealie's full address, like http://192.168.1.20:9000",
      })
      .max(2000),
    token: z
      .string()
      .trim()
      .min(10, "Paste the whole API token.")
      .max(4000, "That's too long for a Mealie token."),
  })
  .openapi("MealieConnection", {
    example: {
      url: "http://192.168.1.20:9000",
      token: "sample-mealie-api-token",
    },
  })

export const MealieCheckSchema = z
  .object({
    version: z.string().nullable().openapi({ example: "v3.28.0" }),
    recipes: z.number().int(),
    alreadyHere: z.number().int().openapi({
      description:
        "Recipes an earlier Mealie import brought in. They're skipped.",
    }),
  })
  .openapi("MealieCheck", {
    example: { version: "v3.28.0", recipes: 312, alreadyHere: 0 },
  })
