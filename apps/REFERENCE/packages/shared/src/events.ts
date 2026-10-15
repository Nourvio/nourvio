/** Pages that update live and show who else has them open. */
export const LIVE_PAGES = ["list"] as const
export type LivePage = (typeof LIVE_PAGES)[number]

export type Person = { id: string; name: string }

/** What a household's open pages hear about (`GET /api/events`). */
export type HouseholdEvent =
  /** The shopping list changed; `by` is who changed it. */
  | { type: "list"; by: string }
  /** A bulk import moved on: a link started, finished or was stopped. */
  | { type: "imports"; batchId: string }
  /** Who has the page open now, you included. */
  | { type: "presence"; page: LivePage; people: Person[] }
