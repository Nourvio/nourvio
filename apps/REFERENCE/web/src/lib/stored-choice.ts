import * as React from "react"

/**
 * A choice remembered on this device (localStorage), shared live by
 * everything that reads it. Returns the hook that reads and sets it.
 */
export function storedChoice<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T
) {
  const listeners = new Set<() => void>()

  function read(): T {
    try {
      const value = localStorage.getItem(key)
      return values.includes(value as T) ? (value as T) : fallback
    } catch {
      return fallback
    }
  }

  function write(value: T) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Private windows can refuse; it just won't be remembered.
    }
    for (const listener of listeners) listener()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return function useStoredChoice() {
    const value = React.useSyncExternalStore(subscribe, read, () => fallback)
    return [value, write] as const
  }
}
