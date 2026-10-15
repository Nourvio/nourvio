import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  Compass01Icon,
  Globe02Icon,
  Link01Icon,
  LinkSquare02Icon,
  Note01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useChat } from "@/features/chat/chat-provider"
import { useAiStatus } from "@/features/settings/use-ai"

import { useImportDialog } from "./use-import"

export function AddRecipeMenu() {
  const navigate = useNavigate()
  const importDialog = useImportDialog()
  const chat = useChat()
  const ai = useAiStatus()

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
        <DropdownMenuItem onSelect={() => importDialog.open("links")}>
          <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
          Several links at once
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/discover")}>
          <HugeiconsIcon icon={Compass01Icon} strokeWidth={2} />
          Browse collections
        </DropdownMenuItem>
        {ai.data?.available && (
          <DropdownMenuItem
            onSelect={() => {
              // A fresh chat with the start of the question typed in.
              chat.newChat()
              chat.setDraft("Find me a recipe for ")
              chat.setOpen(true)
            }}
          >
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} />
            Find one online
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
