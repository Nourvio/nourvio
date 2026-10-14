import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export function NotFoundPage() {
  return (
    <Empty className="mt-12">
      <EmptyHeader>
        <EmptyTitle>Nothing cooking here</EmptyTitle>
        <EmptyDescription>That page doesn't exist.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/recipes">Back to recipes</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
