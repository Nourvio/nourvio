import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Timer02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

export type Timer = {
  id: string
  label: string
  endsAt: number
  done: boolean
}

/** Three short beeps. Needs an AudioContext created during a tap. */
function beep(context: AudioContext) {
  for (let i = 0; i < 3; i++) {
    const start = context.currentTime + i * 0.35
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.3)
  }
}

/** Kitchen timers that beep, vibrate and show a message when they finish. */
export function useTimers() {
  const [timers, setTimers] = React.useState<Timer[]>([])
  const [now, setNow] = React.useState(() => Date.now())
  const timersRef = React.useRef(timers)
  const announced = React.useRef(new Set<string>())
  const audio = React.useRef<AudioContext | null>(null)

  React.useEffect(() => {
    timersRef.current = timers
  }, [timers])

  React.useEffect(() => {
    const interval = setInterval(() => {
      const time = Date.now()
      setNow(time)
      const finished = timersRef.current.filter(
        (timer) =>
          !timer.done &&
          timer.endsAt <= time &&
          !announced.current.has(timer.id)
      )
      if (!finished.length) return
      for (const timer of finished) {
        announced.current.add(timer.id)
        if (audio.current) beep(audio.current)
        navigator.vibrate?.([300, 150, 300, 150, 300])
        toast(`${timer.label} timer is done`, {
          duration: Infinity,
          action: { label: "OK", onClick: () => {} },
        })
      }
      const ids = new Set(finished.map((timer) => timer.id))
      setTimers((current) =>
        current.map((timer) =>
          ids.has(timer.id) ? { ...timer, done: true } : timer
        )
      )
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const start = React.useCallback((label: string, seconds: number) => {
    // Created on the tap that starts the timer, so the browser allows sound later.
    audio.current ??= new AudioContext()
    void audio.current.resume()
    const time = Date.now()
    setNow(time)
    setTimers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label,
        endsAt: time + seconds * 1000,
        done: false,
      },
    ])
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setTimers((current) => current.filter((timer) => timer.id !== id))
  }, [])

  return { timers, now, start, dismiss }
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mmss = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`
  return hours ? `${hours}:${mmss}` : mmss
}

export function TimerChips({
  timers,
  now,
  onDismiss,
}: {
  timers: Timer[]
  now: number
  onDismiss: (id: string) => void
}) {
  if (!timers.length) return null
  return (
    <ul className="flex flex-wrap justify-end gap-2" aria-label="Timers">
      {timers.map((timer) => (
        <li
          key={timer.id}
          role="timer"
          aria-label={`${timer.label} timer`}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full pr-1 pl-3 text-sm font-semibold",
            timer.done
              ? "animate-pulse bg-destructive text-white"
              : "bg-highlight text-highlight-foreground"
          )}
        >
          <HugeiconsIcon
            icon={Timer02Icon}
            strokeWidth={2}
            className="size-4"
          />
          <span className="max-w-28 truncate">{timer.label}</span>
          <span className="tabular-nums">
            {timer.done ? "Done" : formatRemaining(timer.endsAt - now)}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(timer.id)}
            aria-label={timer.done ? "Dismiss timer" : "Cancel timer"}
            className="flex size-8 items-center justify-center rounded-full hover:bg-black/10"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}
