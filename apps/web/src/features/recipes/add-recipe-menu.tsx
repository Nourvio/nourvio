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

import { useImportDialog } from "./use-import"

export function AddRecipeMenu() {
  const navigate = useNavigate()
  const importDialog = useImportDialog()

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
        <DropdownMenuItem onSelect={() => importDialog.open("link")}>
          <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
          From a link or video
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => importDialog.open("text")}>
          <HugeiconsIcon icon={Note01Icon} strokeWidth={2} />
          Paste text
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => importDialog.open("photo")}>
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
