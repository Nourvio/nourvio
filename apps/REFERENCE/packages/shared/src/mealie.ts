import { z } from "zod"

export const mealieConnectionInput = z.object({
  url: z
    .url("Enter Mealie's full address, like http://192.168.1.20:9000")
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "The address starts with http:// or https://",
    }),
  token: z.string().trim().min(10, "Paste the whole API token").max(4000),
})
export type MealieConnectionInput = z.infer<typeof mealieConnectionInput>

export type MealieCheck = {
  version: string | null
  /** Recipes in Mealie. */
  total: number
  /** Of those, already moved over by an earlier import. */
  alreadyImported: number
}

export type MealieJob = {
  id: string
  status: "running" | "done" | "cancelled" | "failed" | "interrupted"
  total: number
  /** Imported this run. */
  imported: number
  /** Already in Nourvio from an earlier import. */
  skipped: number
  failed: number
  createdAt: string
  finishedAt: string | null
}
