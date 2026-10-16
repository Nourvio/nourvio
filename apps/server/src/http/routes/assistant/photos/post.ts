import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { storeChatPhoto } from "../../../../services/assistant/photos.ts"
import { MAX_PHOTO_BYTES } from "../../../../services/recipes/photos.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { AssistantPhotoSchema } from "../../../schemas/assistant.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const keys = openToKeys("assistant", "write")

const tooBig = () =>
  new AppError(
    "too_large",
    "photo_too_large",
    "That photo is too big. Use one under 15 MB."
  )

const route = createRoute({
  method: "post",
  path: "/assistant/photos",
  operationId: "uploadAssistantPhoto",
  tags: ["Assistant"],
  summary: "Add a photo for the assistant",
  description:
    "A photo to send with a message, like what's in the pan: its id goes in the message's `photos`. JPEG, PNG or WebP, up to 15 MB; it's kept smaller, the right way up, with the person's chats.",
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_PHOTO_BYTES,
      onError: () => {
        throw tooBig()
      },
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            // Checked here, to say what's wrong in words.
            photo: z
              .any()
              .optional()
              .openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(AssistantPhotoSchema, "Kept."),
    400: errorResponse("No photo, or not one Merran can read."),
    413: errorResponse("The photo is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    const { photo } = await c.req.parseBody()
    if (!(photo instanceof File)) {
      throw new AppError("invalid", "no_photo", "Add a photo.", {
        photo: "Add a photo.",
      })
    }
    if (photo.size > MAX_PHOTO_BYTES) throw tooBig()
    const kept = await storeChatPhoto(
      files,
      { householdId, userId },
      Buffer.from(await photo.arrayBuffer())
    )
    return c.json(kept, 201)
  })
}
