import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  Link01Icon,
  Note01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { comingSoon } from "@/lib/coming-soon"

export function AddRecipeMenu() {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add recipe
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => comingSoon("Importing a link", 1)}>
          <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
          From a link or video
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => comingSoon("Importing text", 1)}>
          <HugeiconsIcon icon={Note01Icon} strokeWidth={2} />
          Paste text
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => comingSoon("Importing photos", 1)}>
          <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} />
          From a photo
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/recipes/new")}>
          <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
          Type it in
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
