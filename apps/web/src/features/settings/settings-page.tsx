import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { MEAL_NAMES } from "@mise/shared"
import { Link, useLocation, useSearchParams } from "react-router"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/features/auth/current-user"
import { ExtensionCard } from "@/features/extension/extension-card"
import { KrogerAppCard } from "@/features/shop/kroger-app-card"
import { StoresCard } from "@/features/shop/stores-card"
import { ShareCard } from "@/features/share/share-card"
import { useShopStatus } from "@/features/shop/use-shop"
import { useIsMobile } from "@/hooks/use-mobile"

import { AccountCard } from "./account-card"
import { AiCard } from "./ai-card"
import { HouseholdCard } from "./household-card"
import { MealPlanCard } from "./meal-plan-card"
import { MealieCard } from "./mealie-card"
import { NutritionCard } from "./nutrition-card"
import { NutritionLibraryCard } from "./nutrition-library-card"
import { PhotosLibraryCard } from "./photos-library-card"
import { ServerCard } from "./server-card"
import { ListsCard, OnHandCard, WeeklyCard } from "./shopping-cards"
import { TastesCard } from "./tastes-card"
import { TidyUpCard } from "./tidy-up-card"
import { useAiStatus } from "./use-ai"
import { UpdatesCard } from "./updates-card"
import { useHouseholdInfo } from "./use-household"
import { useUpdateAvailable, useUpdates } from "./use-updates"
import { VoiceCard } from "./voice-card"

type TabId = "you" | "household" | "shopping" | "library" | "server"

const TABS: { id: TabId; label: string; blurb: string }[] = [
  {
    id: "you",
    label: "You",
    blurb: "Your account, how Mise looks, and the browser extension.",
  },
  {
    id: "household",
    label: "Household",
    blurb:
      "Who's in the household, what you eat, and how the week gets planned.",
  },
  {
    id: "shopping",
    label: "Shopping",
    blurb: "Your lists, the stores they go to, and what's always on hand.",
  },
  {
    id: "library",
    label: "Library",
    blurb: "Tools that work across every recipe.",
  },
  {
    id: "server",
    label: "This server",
    blurb: "For the server admin: AI, connections, sign-up and Mealie.",
  },
]

/** A page of settings: on a phone it opens on its own; on bigger screens it sits in its tab. */
type Section = {
  id: string
  label: string
  tab: TabId
  /** How it's set up now, under its name in the phone's list. */
  hint: string
  /** Its cards, each with the id links point at (/settings#mealie). */
  cards: { id: string; card: React.ReactNode }[]
}

/**
 * Settings: tabs of full-width cards on a tablet or computer, and on a
 * phone a list of sections that each open on their own. Links to a card
 * (/settings#mealie) open the tab or section it's in.
 */
export function SettingsPage() {
  const sections = useSections()
  const isMobile = useIsMobile()
  const { hash } = useLocation()
  const target = hash
    ? sections.find((section) =>
        section.cards.some((card) => card.id === hash.slice(1))
      )
    : undefined

  // Scroll a linked card into view once it's there.
  React.useEffect(() => {
    if (!hash) return
    const timer = window.setTimeout(
      () => document.getElementById(hash.slice(1))?.scrollIntoView(),
      50
    )
    return () => window.clearTimeout(timer)
  }, [hash, isMobile])

  return isMobile ? (
    <PhoneSettings sections={sections} target={target} />
  ) : (
    <TabbedSettings sections={sections} target={target} />
  )
}

function TabbedSettings({
  sections,
  target,
}: {
  sections: Section[]
  target: Section | undefined
}) {
  const [params, setParams] = useSearchParams()
  const updateReady = useUpdateAvailable()
  const tabs = TABS.filter((tab) => sections.some((s) => s.tab === tab.id))
  const asked = tabs.find((tab) => tab.id === params.get("tab"))
  const current =
    (target && tabs.find((tab) => tab.id === target.tab)) ?? asked ?? tabs[0]!

  return (
    <>
      <PageHeader title="Settings" description={current.blurb} />
      <Tabs
        value={current.id}
        onValueChange={(value) => setParams({ tab: value }, { replace: true })}
        className="gap-6"
      >
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
              {tab.id === "server" && updateReady && (
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-label="An update is ready"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="grid gap-6">
            {sections
              .filter((section) => section.tab === tab.id)
              .flatMap((section) => section.cards)
              .map(({ id, card }) => (
                <section key={id} id={id} className="scroll-mt-20">
                  {card}
                </section>
              ))}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}

function PhoneSettings({
  sections,
  target,
}: {
  sections: Section[]
  target: Section | undefined
}) {
  const [params] = useSearchParams()
  const open =
    target ?? sections.find((section) => section.id === params.get("section"))

  if (open) {
    return (
      <>
        <Link
          to="/settings"
          className="mt-2 -mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-4"
          />
          Settings
        </Link>
        <PageHeader title={open.label} />
        <div className="grid gap-4">
          {open.cards.map(({ id, card }) => (
            <section key={id} id={id} className="scroll-mt-20">
              {card}
            </section>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        {TABS.map((tab) => {
          const inTab = sections.filter((section) => section.tab === tab.id)
          if (!inTab.length) return null
          return (
            <section key={tab.id} className="grid gap-1.5">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {tab.label}
              </h2>
              <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
                {inTab.map((section) => (
                  <li key={section.id}>
                    <Link
                      to={`/settings?section=${section.id}`}
                      className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-muted"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="font-medium">{section.label}</span>
                        <span className="truncate text-sm text-muted-foreground">
                          {section.hint}
                        </span>
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="size-4 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

/** Every section this person can see, with how each is set up now. */
function useSections(): Section[] {
  const me = useCurrentUser()
  const ai = useAiStatus().data
  const household = useHouseholdInfo().data
  const kroger = useShopStatus().data?.kroger
  const updates = useUpdates().data
  const admin = me.role === "admin"
  const withAi = Boolean(ai?.available)

  const lists = household?.lists ?? []
  const library = [
    admin && withAi && { id: "tidying", card: <TidyUpCard /> },
    admin &&
      (withAi || ai?.usda) && {
        id: "nutrition",
        card: <NutritionLibraryCard />,
      },
    admin && withAi && { id: "photos", card: <PhotosLibraryCard /> },
  ].filter((card): card is { id: string; card: React.ReactElement } =>
    Boolean(card)
  )
  const avoid = household?.tastes.avoid.length ?? 0

  const candidates: (Section | false)[] = [
    {
      id: "account",
      label: "Account",
      tab: "you",
      hint: `${me.displayName} · password and sign-out`,
      cards: [{ id: "account", card: <AccountCard /> }],
    },
    {
      id: "appearance",
      label: "Appearance",
      tab: "you",
      hint: "Light or dark, and the palette",
      cards: [{ id: "appearance", card: <AppearanceCard /> }],
    },
    {
      id: "extension",
      label: "Browser extension",
      tab: "you",
      hint: "Import from any page, on a computer",
      cards: [
        { id: "extension", card: <ExtensionCard /> },
        { id: "styleguide", card: <StyleGuideCard /> },
      ],
    },
    {
      id: "share",
      label: "Share to Mise",
      tab: "you",
      hint: "Send receipts from other apps",
      cards: [{ id: "share", card: <ShareCard /> }],
    },
    {
      id: "people",
      label: "People",
      tab: "household",
      hint: household
        ? `Everyone in ${household.name}`
        : "Everyone in the household",
      cards: [{ id: "household", card: <HouseholdCard /> }],
    },
    {
      id: "tastes",
      label: "Tastes and rules",
      tab: "household",
      hint: avoid
        ? `${avoid} ${avoid === 1 ? "food" : "foods"} to avoid`
        : "What you eat and don't",
      cards: [{ id: "tastes", card: <TastesCard /> }],
    },
    admin && {
      id: "meal-plan",
      label: "Meal plan",
      tab: "household",
      hint: household
        ? `${household.meals.map((meal) => MEAL_NAMES[meal]).join(", ")}${household.autoPlan.enabled ? " · plans itself" : ""}`
        : "Meals and the weekly autopilot",
      cards: [{ id: "meal-plan", card: <MealPlanCard /> }],
    },
    {
      id: "shopping",
      label: "Shopping",
      tab: "shopping",
      hint: [
        lists.length > 1
          ? lists.map((list) => list.name).join(" and ")
          : "One list",
        kroger?.linked && kroger.store ? `${kroger.store.banner} linked` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      cards: [
        { id: "lists", card: <ListsCard /> },
        { id: "connections", card: <StoresCard /> },
        { id: "on-hand", card: <OnHandCard /> },
        { id: "weekly", card: <WeeklyCard /> },
      ],
    },
    library.length > 0 && {
      id: "library",
      label: "Library tools",
      tab: "library",
      hint: "Tidying up, nutrition and photos",
      cards: library,
    },
    me.isServerAdmin && {
      id: "updates",
      label: "Updates",
      tab: "server",
      hint:
        updates?.state === "available"
          ? `An update is ready: ${updates.changes.length} ${updates.changes.length === 1 ? "change" : "changes"}`
          : updates?.state === "current"
            ? "Up to date"
            : "Whether there's a newer Mise",
      cards: [{ id: "updates", card: <UpdatesCard /> }],
    },
    me.isServerAdmin && {
      id: "signup",
      label: "Sign-up and households",
      tab: "server",
      hint: "Who can join, and every household",
      cards: [{ id: "server", card: <ServerCard /> }],
    },
    me.isServerAdmin && {
      id: "ai",
      label: "AI",
      tab: "server",
      hint: ai?.providers.length
        ? `${ai.providers.map((p) => (p === "anthropic" ? "Claude" : "OpenAI")).join(" and ")} · models and spending`
        : "Not set up yet",
      cards: [{ id: "ai", card: <AiCard /> }],
    },
    me.isServerAdmin && {
      id: "server-connections",
      label: "Connections",
      tab: "server",
      hint: [
        kroger?.ready ? "Kroger set up" : "Kroger not set up",
        ai?.usda ? "USDA key added" : "no USDA key",
      ].join(" · "),
      cards: [
        { id: "kroger", card: <KrogerAppCard /> },
        { id: "nutrition-data", card: <NutritionCard /> },
      ],
    },
    me.isServerAdmin && {
      id: "voice",
      label: "Voice",
      tab: "server",
      hint: "How cook mode reads aloud",
      cards: [{ id: "voice", card: <VoiceCard /> }],
    },
    me.isServerAdmin && {
      id: "mealie",
      label: "Move from Mealie",
      tab: "server",
      hint: "A one-time import",
      cards: [{ id: "mealie", card: <MealieCard /> }],
    },
  ]
  return candidates.filter((section): section is Section => Boolean(section))
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

function StyleGuideCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Style guide</CardTitle>
        <CardDescription>Every component in the current theme.</CardDescription>
        <CardAction>
          <Button variant="outline" asChild>
            <Link to="/styleguide">Open</Link>
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
