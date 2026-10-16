import type { IconSvgElement } from "@hugeicons/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

import { PageHeader } from "./page-header"

/** A section that's on its way: its name, and what it'll do. */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: IconSvgElement
}) {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={title} />
      <Empty className="rounded-3xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t("comingSoon.title")}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  )
}
