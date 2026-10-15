import { LIVE_PAGES, type HouseholdEvent, type LivePage } from "@mise/shared"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

import { requireUser } from "../auth/middleware.ts"
import { currentUser, type AppEnv } from "../context.ts"
import type { EventBus } from "../services/events.ts"

/** Keeps the connection open through proxies (Cloudflare's tunnel closes idle ones). */
const PING_MS = 25_000

/**
 * The household's live changes as server-sent events, for as long as a page
 * stays open. `?page=list` also says who has the list open.
 */
export function eventRoutes(events: EventBus) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", (c) => {
    const user = currentUser(c)
    const asked = c.req.query("page")
    const page = LIVE_PAGES.includes(asked as LivePage)
      ? (asked as LivePage)
      : null
    c.header("cache-control", "no-cache, no-transform")
    c.header("x-accel-buffering", "no")
    return streamSSE(c, async (stream) => {
      let open = true
      const send = (event: HouseholdEvent) => {
        if (!open) return
        void stream
          .writeSSE({ event: event.type, data: JSON.stringify(event) })
          .catch(() => {
            open = false
          })
      }
      const stop = events.subscribe(user.householdId, {
        userId: user.id,
        name: user.displayName,
        page,
        send,
      })
      // Gone as soon as the page closes, so "on the list too" doesn't linger.
      let stopped = false
      const end = () => {
        open = false
        if (stopped) return
        stopped = true
        stop()
      }
      stream.onAbort(end)
      try {
        while (open && !stream.aborted) {
          await stream.sleep(PING_MS)
          if (open) await stream.writeSSE({ event: "ping", data: "" })
        }
      } catch {
        // The page went away.
      } finally {
        end()
      }
    })
  })

  return app
}
