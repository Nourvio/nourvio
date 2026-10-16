import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { readChatPhoto } from "../../../../../services/assistant/photos.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AssistantPhotoParam } from "../../../../schemas/assistant.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/assistant/photos/{photoId}",
  operationId: "getAssistantPhoto",
  tags: ["Assistant"],
  summary: "A photo sent to the assistant",
  description:
    "As JPEG. Only the person who sent it sees it, like their chats. A photo never changes, so it can be kept for good.",
  ...openToKeys("assistant", "read"),
  request: { params: AssistantPhotoParam },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("No such photo of yours."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    const photo = await readChatPhoto(
      files,
      { householdId, userId },
      c.req.valid("param").photoId
    )
    if (!photo) {
      throw new AppError(
        "not_found",
        "photo_not_found",
        "There's no such photo."
      )
    }
    c.header("Content-Type", "image/jpeg")
    c.header("Cache-Control", "private, max-age=31536000, immutable")
    return c.body(new Uint8Array(photo), 200)
  })
}
