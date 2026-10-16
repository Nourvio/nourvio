import { useTranslation } from "react-i18next"

import { formatMinutes } from "@/features/recipes/format"
import type { Schemas } from "@/lib/api/client"

export type Reason = Schemas["Reason"]

/** Says why a meal was picked: "Taco night · Rated 5 stars". */
export function useWhyText() {
  const { t } = useTranslation()
  return (why: readonly Reason[]) =>
    why
      .map((reason) => {
        switch (reason.kind) {
          case "theme":
            return t("plan.why.theme", { label: reason.label })
          case "themeMissed":
            return t("plan.why.themeMissed", { label: reason.label })
          case "new":
            return t("plan.why.new")
          case "notLately":
            return t("plan.why.notLately", { count: reason.weeks })
          case "rated":
            return t("plan.why.rated", { count: reason.stars })
          case "quick":
            return t("plan.why.quick", {
              time: formatMinutes(t, reason.minutes),
            })
        }
      })
      .join(" · ")
}
