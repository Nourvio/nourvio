import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Link } from "react-router"

import { cn } from "@/lib/utils"

/**
 * A page's main column with a side column beside it on wide screens, so a
 * desktop uses its width. On phones the side column comes after the main.
 */
export function WithAside({
  children,
  aside,
}: {
  children: React.ReactNode
  aside: React.ReactNode
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 content-start gap-6">{children}</div>
      <aside className="grid min-w-0 content-start gap-4">{aside}</aside>
    </div>
  )
}

/** A section title, with an optional link to see more. */
export function SectionHeading({
  id,
  children,
  to,
  link,
}: {
  id?: string
  children: React.ReactNode
  to?: string
  link?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {children}
      </h2>
      {to && link && (
        <Link
          to={to}
          className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
        >
          {link}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Link>
      )}
    </div>
  )
}

/** A card for a side column: a title, an optional link or button, and what's in it. */
export function Panel({
  title,
  to,
  link,
  action,
  tone,
  className,
  children,
}: {
  title: React.ReactNode
  to?: string
  link?: string
  /** A button in the corner, instead of a link. */
  action?: React.ReactNode
  /** "warn" for something that needs attention, like food to use soon. */
  tone?: "warn"
  className?: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "grid content-start gap-3 rounded-3xl border bg-card p-5 text-card-foreground",
        tone === "warn" && "border-amber-500/40",
        className
      )}
    >
      {action ? (
        <div className="flex items-center justify-between gap-3">
          <h2 id={id} className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {action}
        </div>
      ) : (
        <SectionHeading id={id} to={to} link={link}>
          {title}
        </SectionHeading>
      )}
      {children}
    </section>
  )
}
