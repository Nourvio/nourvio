/**
 * Counts failures per key in a sliding window, in memory. Mise runs as a
 * single process, so this doesn't need to be shared.
 */
export class RateLimiter {
  #failures = new Map<string, number[]>()
  #limit: number
  #windowMs: number

  constructor(limit: number, windowMs: number) {
    this.#limit = limit
    this.#windowMs = windowMs
  }

  #recent(key: string, now: number) {
    const times = (this.#failures.get(key) ?? []).filter(
      (time) => now - time < this.#windowMs
    )
    if (times.length) {
      this.#failures.set(key, times)
    } else {
      this.#failures.delete(key)
    }
    return times
  }

  /** Seconds until another attempt is allowed, or 0 if one is allowed now. */
  retryAfter(key: string, now = Date.now()) {
    const times = this.#recent(key, now)
    if (times.length < this.#limit) return 0
    return Math.ceil((times[0]! + this.#windowMs - now) / 1000)
  }

  fail(key: string, now = Date.now()) {
    this.#failures.set(key, [...this.#recent(key, now), now])
  }

  reset(key: string) {
    this.#failures.delete(key)
  }
}
