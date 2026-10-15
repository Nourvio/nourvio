import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Timer02Icon } from "@hugeicons/core-free-icons"
import { Link } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type Timer = {
  id: string
  label: string
  endsAt: number
  done: boolean
  /** The cooking it was started from, to get back to it. */
  href: string | null
}

// Kitchen timers live outside any page, so they keep running (and ringing)
// anywhere in the app, and are saved so a reload doesn't lose them.
const STORAGE_KEY = "mise.timers"
const listeners = new Set<() => void>()
let timers: Timer[] = load()
let audio: AudioContext | null = null

function load(): Timer[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function change(next: Timer[]) {
  timers = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers))
  } catch {
    // Not saved; they still run until the page reloads.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Sound needs an AudioContext made during a tap, so this runs on one. */
function wakeAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    // No sound here; timers still vibrate and show a message.
  }
}

export function startTimer(label: string, seconds: number, href: string) {
  wakeAudio()
  change([
    ...timers,
    {
      id: crypto.randomUUID(),
      label,
      endsAt: Date.now() + seconds * 1000,
      done: false,
      href,
    },
  ])
}

/** A minute more, also for one that's just gone off. */
export function addMinute(id: string) {
  wakeAudio()
  toast.dismiss(`timer-${id}`)
  const now = Date.now()
  change(
    timers.map((timer) =>
      timer.id === id
        ? {
            ...timer,
            endsAt: (timer.done ? now : timer.endsAt) + 60_000,
            done: false,
          }
        : timer
    )
  )
}

export function dismissTimer(id: string) {
  toast.dismiss(`timer-${id}`)
  change(timers.filter((timer) => timer.id !== id))
}

export function useTimers() {
  return React.useSyncExternalStore(
    subscribe,
    () => timers,
    () => timers
  )
}

/** Three short beeps. */
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

/**
 * Rings timers when they finish: a beep, a buzz and a message that stays
 * until it's seen. Mounted once for the whole app.
 */
export function TimerAlarm() {
  const running = useTimers().some((timer) => !timer.done)

  React.useEffect(() => {
    if (!running) return
    // After a reload there's no sound until the next tap anywhere.
    document.addEventListener("pointerdown", wakeAudio, { once: true })
    const interval = setInterval(() => {
      const now = Date.now()
      const finished = timers.filter(
        (timer) => !timer.done && timer.endsAt <= now
      )
      if (!finished.length) return
      for (const timer of finished) {
        if (audio) beep(audio)
        navigator.vibrate?.([300, 150, 300, 150, 300])
        toast(`${timer.label} timer is done`, {
          id: `timer-${timer.id}`,
          duration: Infinity,
          action: {
            label: "+1 min",
            onClick: () => addMinute(timer.id),
          },
          cancel: { label: "OK", onClick: () => dismissTimer(timer.id) },
        })
      }
      const ids = new Set(finished.map((timer) => timer.id))
      change(
        timers.map((timer) =>
          ids.has(timer.id) ? { ...timer, done: true } : timer
        )
      )
    }, 500)
    return () => {
      clearInterval(interval)
      document.removeEventListener("pointerdown", wakeAudio)
    }
  }, [running])

  return null
}

/** The time now, ticking while there's something to count down. */
function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [active])
  return now
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mmss = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`
  return hours ? `${hours}:${mmss}` : mmss
}

/** Every timer with its label, a minute more, and cancel. For cooking. */
export function TimerChips({ className }: { className?: string }) {
  const list = useTimers()
  const now = useNow(list.length > 0)
  if (!list.length) return null
  return (
    <ul
      className={cn("flex flex-wrap justify-end gap-2", className)}
      aria-label="Timers"
    >
      {list.map((timer) => (
        <li
          key={timer.id}
          role="timer"
          aria-label={`${timer.label} timer`}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-full pr-1 pl-3 text-sm font-semibold",
            timer.done
              ? "animate-pulse bg-destructive text-white"
              : "bg-highlight text-highlight-foreground"
          )}
        >
          <HugeiconsIcon
            icon={Timer02Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <span className="max-w-28 truncate">{timer.label}</span>
          <span className="tabular-nums">
            {timer.done ? "Done" : formatRemaining(timer.endsAt - now)}
          </span>
          <button
            type="button"
            onClick={() => addMinute(timer.id)}
            aria-label={`Add a minute to ${timer.label}`}
            className="flex h-8 items-center rounded-full px-2 text-xs hover:bg-black/10"
          >
            +1
          </button>
          <button
            type="button"
            onClick={() => dismissTimer(timer.id)}
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

/**
 * Small countdowns for the app's top bar while cooking elsewhere, each a
 * link back to the cooking it came from.
 */
export function TimerBadges() {
  const list = useTimers()
  const now = useNow(list.length > 0)
  if (!list.length) return null
  const shown = [...list].sort((a, b) => a.endsAt - b.endsAt).slice(0, 2)
  return (
    <ul className="flex items-center gap-1.5" aria-label="Timers">
      {shown.map((timer) => {
        const content = (
          <>
            <HugeiconsIcon
              icon={Timer02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            <span className="tabular-nums">
              {timer.done ? "Done" : formatRemaining(timer.endsAt - now)}
            </span>
          </>
        )
        const style = cn(
          "flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold",
          timer.done
            ? "animate-pulse bg-destructive text-white"
            : "bg-highlight text-highlight-foreground"
        )
        return (
          <li key={timer.id} role="timer" aria-label={`${timer.label} timer`}>
            {timer.href ? (
              <Link to={timer.href} className={style} title={timer.label}>
                {content}
              </Link>
            ) : (
              <span className={style} title={timer.label}>
                {content}
              </span>
            )}
          </li>
        )
      })}
      {list.length > 2 && (
        <li className="text-xs text-muted-foreground">+{list.length - 2}</li>
      )}
    </ul>
  )
}

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60]

/** A timer for something the steps don't time, like "rest the dough". */
export function NewTimerButton({ href }: { href: string }) {
  const [open, setOpen] = React.useState(false)
  const [minutes, setMinutes] = React.useState("")
  const typed = Number(minutes)

  function start(length: number) {
    const label = length === 60 ? "1 hr" : `${length} min`
    startTimer(label, Math.round(length * 60), href)
    toast(`Timer started: ${label}`)
    setOpen(false)
    setMinutes("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="New timer"
          title="New timer"
        >
          <HugeiconsIcon icon={Timer02Icon} strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-3">
        <p className="text-sm font-medium">New timer</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((length) => (
            <Button
              key={length}
              variant="secondary"
              size="sm"
              onClick={() => start(length)}
            >
              {length === 60 ? "1 hr" : `${length} min`}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed > 0 && typed <= 24 * 60) start(typed)
          }}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0.5}
            max={24 * 60}
            step="any"
            placeholder="Minutes"
            aria-label="Minutes"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
          <Button type="submit" disabled={!(typed > 0 && typed <= 24 * 60)}>
            Start
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
