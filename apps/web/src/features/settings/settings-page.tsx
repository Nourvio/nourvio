import * as React from "react"
import { Link, useLocation } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { ModeToggleGroup } from "@/components/theme/mode-toggle"
import { PalettePicker } from "@/components/theme/palette-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useCurrentUser } from "@/features/auth/current-user"
import { cn } from "@/lib/utils"

import { AccountCard } from "./account-card"
import { AiCard } from "./ai-card"
import { HouseholdCard } from "./household-card"
import { MealPlanCard } from "./meal-plan-card"
import { MealieCard } from "./mealie-card"
import { NutritionCard } from "./nutrition-card"
import { NutritionLibraryCard } from "./nutrition-library-card"
import { PhotosLibraryCard } from "./photos-library-card"
import { ServerCard } from "./server-card"
import { TidyUpCard } from "./tidy-up-card"
import { useAiStatus } from "./use-ai"

type Section = {
  id: string
  label: string
  group: "You" | "Household" | "This server"
  card: React.ReactNode
}

/**
 * Settings, with a list of its sections down the side on wide screens that
 * follows along as you scroll. Links like /settings#mealie jump to a card.
 */
export function SettingsPage() {
  const me = useCurrentUser()
  const ai = useAiStatus()
  const { hash } = useLocation()
  const admin = me.role === "admin"

  const candidates: (Section | false | undefined)[] = [
    { id: "account", label: "Account", group: "You", card: <AccountCard /> },
    {
      id: "appearance",
      label: "Appearance",
      group: "You",
      card: <AppearanceCard />,
    },
    {
      id: "household",
      label: "People",
      group: "Household",
      card: <HouseholdCard />,
    },
    admin && {
      id: "meal-plan",
      label: "Meal plan",
      group: "Household",
      card: <MealPlanCard />,
    },
    admin &&
      ai.data?.available && {
        id: "tidying",
        label: "Tidying up",
        group: "Household",
        card: <TidyUpCard />,
      },
    admin &&
      (ai.data?.available || ai.data?.usda) && {
        id: "nutrition",
        label: "Nutrition",
        group: "Household",
        card: <NutritionLibraryCard />,
      },
    admin &&
      ai.data?.available && {
        id: "photos",
        label: "Photos",
        group: "Household",
        card: <PhotosLibraryCard />,
      },
    me.isServerAdmin && {
      id: "server",
      label: "Sign-up and households",
      group: "This server",
      card: <ServerCard />,
    },
    me.isServerAdmin && {
      id: "ai",
      label: "AI",
      group: "This server",
      card: <AiCard />,
    },
    me.isServerAdmin && {
      id: "nutrition-data",
      label: "Nutrition data",
      group: "This server",
      card: <NutritionCard />,
    },
    me.isServerAdmin && {
      id: "mealie",
      label: "Mealie",
      group: "This server",
      card: <MealieCard />,
    },
  ]
  const sections = candidates.filter((section): section is Section =>
    Boolean(section)
  )

  const active = useActiveSection(sections.map((section) => section.id))

  React.useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  const groups = [...new Set(sections.map((section) => section.group))]

  return (
    <>
      <PageHeader title="Settings" />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Settings sections"
          className="hidden lg:sticky lg:top-20 lg:block lg:self-start"
        >
          {groups.map((group) => (
            <div key={group} className="mb-5">
              <p className="mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </p>
              <ul className="grid gap-0.5">
                {sections
                  .filter((section) => section.group === group)
                  .map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        aria-current={
                          section.id === active ? "location" : undefined
                        }
                        className={cn(
                          "block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                          section.id === active &&
                            "bg-secondary font-medium text-foreground"
                        )}
                      >
                        {section.label}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="grid min-w-0 gap-6">
          {groups.map((group, index) => (
            <React.Fragment key={group}>
              {group === "This server" && (
                <h2
                  className={cn("text-xl font-semibold", index > 0 && "pt-4")}
                >
                  Running this server
                </h2>
              )}
              {sections
                .filter((section) => section.group === group)
                .map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-20"
                  >
                    {section.card}
                  </section>
                ))}
            </React.Fragment>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Style guide</CardTitle>
              <CardDescription>
                Every component in the current theme.
              </CardDescription>
              <CardAction>
                <Button variant="outline" asChild>
                  <Link to="/styleguide">Open</Link>
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        </div>
      </div>
    </>
  )
}

function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Saved to your account, so it follows you to every device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Mode</FieldLabel>
            <ModeToggleGroup />
          </Field>
          <Field>
            <FieldLabel>Palette</FieldLabel>
            <PalettePicker />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

/** The section being read: the last one whose top has scrolled past the top bar. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = React.useState(ids[0] ?? null)
  const key = ids.join(" ")

  React.useEffect(() => {
    const list = key.split(" ")
    let frame = 0
    // A section picked from the list stays lit until you scroll yourself,
    // even when the page can't scroll far enough to bring it to the top.
    let picked: string | null = null
    function pick() {
      const id = window.location.hash.slice(1)
      if (!list.includes(id)) return
      picked = id
      setActive(id)
    }
    function unpick() {
      picked = null
    }
    function update() {
      frame = 0
      if (picked) return
      let current = list[0] ?? null
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= 120) current = id
      }
      // At the very bottom, the last section counts even if it's short.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        current = list.at(-1) ?? current
      }
      setActive(current)
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    pick()
    update()
    const userScroll = ["wheel", "touchmove", "keydown", "pointerdown"]
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    window.addEventListener("hashchange", pick)
    for (const type of userScroll) {
      window.addEventListener(type, unpick, { passive: true })
    }
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      window.removeEventListener("hashchange", pick)
      for (const type of userScroll) window.removeEventListener(type, unpick)
      cancelAnimationFrame(frame)
    }
  }, [key])

  return active
}
