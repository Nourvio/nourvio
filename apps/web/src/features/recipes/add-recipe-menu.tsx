import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  Link01Icon,
  Note01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { comingSoon } from "@/lib/coming-soon"

const ADD_OPTIONS = [
  { label: "From a link", icon: Link01Icon },
  { label: "Paste text", icon: Note01Icon },
  { label: "From a photo", icon: Camera01Icon },
  { label: "Type it in", icon: PencilEdit01Icon },
]

export function AddRecipeMenu() {
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
      <DropdownMenuContent align="end" className="w-48">
        {ADD_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.label}
            onSelect={() => comingSoon("Adding recipes", 1)}
          >
            <HugeiconsIcon icon={option.icon} strokeWidth={2} />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
