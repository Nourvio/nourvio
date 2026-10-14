import { HugeiconsIcon } from "@hugeicons/react"
import {
  CookBookIcon,
  Link01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { comingSoon } from "@/lib/coming-soon"

import { AddRecipeMenu } from "./add-recipe-menu"

export function RecipesPage() {
  return (
    <>
      <PageHeader
        title="Recipes"
        description="Everything you cook, in one place."
        actions={<AddRecipeMenu />}
      />
      <InputGroup className="max-w-md">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search recipes, ingredients or tags" />
      </InputGroup>
      <Empty className="mt-6 border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No recipes yet</EmptyTitle>
          <EmptyDescription>
            Paste a link from any recipe site, snap a photo of a cookbook page,
            or bring over your Mealie library.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => comingSoon("Importing from a link", 1)}>
              <HugeiconsIcon
                icon={Link01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Import from a link
            </Button>
            <Button
              variant="outline"
              onClick={() => comingSoon("Moving from Mealie", 1)}
            >
              Move from Mealie
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </>
  )
}
