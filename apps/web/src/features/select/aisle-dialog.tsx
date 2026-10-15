import { STORE_SECTIONS, type StoreSectionId } from "@mise/shared"

import { ResponsiveDialog } from "@/components/responsive-dialog"

/** Which aisle selected things go in (List and Pantry). */
export function AisleDialog({
  count,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (sectionId: StoreSectionId) => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${count === 1 ? "it" : `these ${count}`} to an aisle`}
      description="Nourvio remembers, so they go there next time too."
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {STORE_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onPick(section.id)}
            className="rounded-2xl border px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {section.name}
          </button>
        ))}
      </div>
    </ResponsiveDialog>
  )
}
