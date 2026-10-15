import { localClock } from "@mise/shared"
import { and, eq, isNotNull } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { shopConnections } from "../db/schema.ts"
import { getHousehold } from "./households.ts"
import type { ShopService } from "./shop.ts"

/** Prices are checked once a day, from this hour in the household's time zone. */
const CHECK_HOUR = 5
/** After a check fails (Kroger down, the app's key refused), wait this long. */
const RETRY_MS = 60 * 60_000

/** A household's daily check is due: not yet today, and it's morning there. */
export function priceCheckDue(
  checkedAt: Date | null,
  timeZone: string,
  now: Date
) {
  const clock = localClock(now, timeZone)
  if (clock.hour < CHECK_HOUR) return false
  return !checkedAt || localClock(checkedAt, timeZone).date !== clock.date
}

const failedAt = new Map<string, number>()

/** Checks prices for every household with a Fry's store whose check is due. */
export async function runDuePriceChecks(
  db: Db,
  shop: ShopService,
  now = new Date()
) {
  const rows = await db
    .select({
      householdId: shopConnections.householdId,
      checkedAt: shopConnections.pricesCheckedAt,
    })
    .from(shopConnections)
    .where(
      and(eq(shopConnections.shop, "kroger"), isNotNull(shopConnections.store))
    )
  for (const { householdId, checkedAt } of rows) {
    if (now.getTime() - (failedAt.get(householdId) ?? 0) < RETRY_MS) continue
    try {
      const { autoPlan } = await getHousehold(db, householdId)
      if (!priceCheckDue(checkedAt, autoPlan.timeZone, now)) continue
      const check = await shop.checkPrices(householdId)
      failedAt.delete(householdId)
      console.log(
        `Checked Fry's prices for household ${householdId}: ${check.refreshed} refreshed, ${check.searched} looked up, ${check.onSale} recipe foods on sale`
      )
    } catch (error) {
      failedAt.set(householdId, now.getTime())
      console.error(
        `Price check for household ${householdId} failed:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}

/** Checks for due price checks every so often while the server runs. */
export function startPriceScheduler(
  db: Db,
  shop: ShopService,
  everyMs = 15 * 60_000
) {
  const check = () => {
    void runDuePriceChecks(db, shop).catch((error) =>
      console.error("Price check failed:", error)
    )
  }
  setTimeout(check, 60_000).unref()
  setInterval(check, everyMs).unref()
}
