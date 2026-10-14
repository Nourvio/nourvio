import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Clock01Icon,
  CookingPotIcon,
  ServingFoodIcon,
  SparklesIcon,
  StarIcon,
  Timer02Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/layout/page-header"
import { ModeToggleGroup } from "@/components/theme/mode-toggle"
import { PalettePicker } from "@/components/theme/palette-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** Class names are written out in full so Tailwind can find them. */
const TOKENS = [
  { name: "background", swatch: "bg-background text-foreground" },
  { name: "card", swatch: "bg-card text-card-foreground" },
  { name: "primary", swatch: "bg-primary text-primary-foreground" },
  { name: "secondary", swatch: "bg-secondary text-secondary-foreground" },
  { name: "muted", swatch: "bg-muted text-muted-foreground" },
  { name: "accent", swatch: "bg-accent text-accent-foreground" },
  { name: "highlight", swatch: "bg-highlight text-highlight-foreground" },
  { name: "destructive", swatch: "bg-destructive text-white" },
]

const INGREDIENTS = [
  { amount: "1 ½ lb", item: "bone-in chicken thighs" },
  { amount: "3 cloves", item: "garlic, minced" },
  { amount: "1", item: "lemon, zested and juiced" },
  { amount: "2 tbsp", item: "olive oil" },
  { amount: "1 tsp", item: "smoked paprika" },
]

export function StyleguidePage() {
  return (
    <>
      <PageHeader
        title="Style guide"
        description="Every building block in the current theme. Switch mode and palette to compare."
      />
      <div className="grid gap-10">
        <Section title="Theme">
          <div className="grid gap-4">
            <ModeToggleGroup />
            <PalettePicker />
          </div>
        </Section>

        <Section title="Color tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOKENS.map((token) => (
              <div
                key={token.name}
                className={cn(
                  "flex h-20 items-end rounded-2xl border p-3 text-sm font-medium",
                  token.swatch
                )}
              >
                {token.name}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="space-y-3">
            <p className="font-heading text-4xl font-semibold tracking-tight">
              Lemon-garlic chicken thighs
            </p>
            <p className="font-heading text-2xl font-semibold">For the sauce</p>
            <p className="max-w-prose">
              Body text is Figtree. Headings use Fraunces, a soft serif that
              gives recipes a cookbook feel without getting fussy.
            </p>
            <p className="text-sm text-muted-foreground">
              Muted text for times, sources and hints.
            </p>
          </div>
        </Section>

        <Section title="Recipe card">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RecipeCardSample />
            <Card className="gap-3">
              <Skeleton className="mx-6 aspect-[4/3] rounded-xl" />
              <CardContent className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Cooking">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <IngredientChecklistSample />
            <CookStepSample />
          </div>
        </Section>

        <Section title="AI proposal">
          <ProposalSample />
        </Section>

        <Section title="Buttons and badges">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
            <Button size="icon" aria-label="Add">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            </Button>
            <Button disabled>
              <Spinner data-icon="inline-start" />
              Saving
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>weeknight</Badge>
            <Badge variant="secondary">chicken</Badge>
            <Badge variant="outline">30 min</Badge>
            <Badge variant="destructive">out of stock</Badge>
            <Badge className="bg-highlight text-highlight-foreground">
              <HugeiconsIcon icon={Timer02Icon} strokeWidth={2} />
              12:30
            </Badge>
          </div>
        </Section>

        <Section title="Forms">
          <Card>
            <CardContent>
              <Tabs defaultValue="link">
                <TabsList>
                  <TabsTrigger value="link">Link</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="photo">Photo</TabsTrigger>
                </TabsList>
                <TabsContent value="link" className="pt-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="sg-url">Recipe link</FieldLabel>
                      <Input id="sg-url" placeholder="https://" />
                    </Field>
                    <Field>
                      <FieldLabel>Meal</FieldLabel>
                      <Select defaultValue="dinner">
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="breakfast">Breakfast</SelectItem>
                          <SelectItem value="lunch">Lunch</SelectItem>
                          <SelectItem value="dinner">Dinner</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>
                </TabsContent>
                <TabsContent value="text" className="pt-4">
                  <Textarea
                    placeholder="Paste a recipe from anywhere"
                    rows={4}
                  />
                </TabsContent>
                <TabsContent
                  value="photo"
                  className="pt-4 text-muted-foreground"
                >
                  Photo import goes here.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </Section>

        <Section title="Feedback">
          <div className="grid gap-4">
            <Alert>
              <AlertTitle>Couldn't read that page</AlertTitle>
              <AlertDescription>
                The site blocked us. Paste the recipe text instead and the AI
                will tidy it up.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cleaning up 212 recipes</span>
                <span className="text-muted-foreground">64%</span>
              </div>
              <Progress value={64} />
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function RecipeCardSample() {
  return (
    <Card className="gap-4 overflow-hidden pt-0">
      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-accent via-secondary to-highlight/25">
        <HugeiconsIcon
          icon={CookingPotIcon}
          strokeWidth={1.5}
          className="size-12 text-accent-foreground/60"
        />
      </div>
      <CardHeader>
        <CardTitle className="text-lg">Lemon-garlic chicken thighs</CardTitle>
        <CardDescription className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              icon={Clock01Icon}
              strokeWidth={2}
              className="size-4"
            />
            35 min
          </span>
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              icon={ServingFoodIcon}
              strokeWidth={2}
              className="size-4"
            />
            4 servings
          </span>
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-between">
        <div className="flex gap-1.5">
          <Badge variant="secondary">weeknight</Badge>
          <Badge variant="secondary">chicken</Badge>
        </div>
        <span className="flex text-highlight" aria-label="Rated 4 out of 5">
          {[0, 1, 2, 3].map((i) => (
            <HugeiconsIcon
              key={i}
              icon={StarIcon}
              strokeWidth={2}
              className="size-4 fill-current"
            />
          ))}
        </span>
      </CardFooter>
    </Card>
  )
}

function IngredientChecklistSample() {
  const [checked, setChecked] = React.useState<Set<number>>(() => new Set([1]))

  const toggle = (index: number) =>
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingredients</CardTitle>
        <CardDescription>4 servings</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {INGREDIENTS.map((ingredient, index) => {
            const id = `sg-ingredient-${index}`
            const done = checked.has(index)
            return (
              <li key={id} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked={done}
                  onCheckedChange={() => toggle(index)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={id}
                  className={cn(
                    "text-base leading-snug font-normal",
                    done && "text-muted-foreground line-through"
                  )}
                >
                  <span className="font-semibold">{ingredient.amount}</span>{" "}
                  {ingredient.item}
                </Label>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function CookStepSample() {
  return (
    <Card className="justify-between">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
            3
          </span>
          Step 3 of 7
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-2xl leading-snug md:text-3xl">
          Roast for <strong className="font-semibold">25 minutes</strong>, until
          the skin is deep golden and crisp.
        </p>
        <Button className="bg-highlight text-highlight-foreground hover:bg-highlight/85">
          <HugeiconsIcon
            icon={Timer02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Start 25 min timer
        </Button>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="outline" size="lg">
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Back
        </Button>
        <Button size="lg">
          Next
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Button>
      </CardFooter>
    </Card>
  )
}

function ProposalSample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={SparklesIcon}
            strokeWidth={2}
            className="size-5 text-primary"
          />
          Tidy up: steps
        </CardTitle>
        <CardDescription>
          Shorter steps, same method. Pick what to keep.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-dashed p-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Before
          </p>
          <p className="text-muted-foreground">
            Now you're going to want to take your chicken thighs, which you
            should have patted really dry (this is SO important for crispy
            skin!!), and place them in the pan skin side down.
          </p>
        </div>
        <div className="rounded-xl bg-accent p-4 text-accent-foreground">
          <p className="mb-2 text-xs font-medium tracking-wide uppercase opacity-80">
            After
          </p>
          <p>Pat the chicken dry, then lay it skin-side down in the pan.</p>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost">Dismiss</Button>
        <Button>Apply</Button>
      </CardFooter>
    </Card>
  )
}
