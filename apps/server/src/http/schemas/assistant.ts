import { z } from "@hono/zod-openapi"
import { MAX_MESSAGE_PHOTOS } from "../../services/assistant/photos.ts"
import { IDS, TIMES } from "./examples.ts"

const PHOTO_ID = "4f1c2a9e7b3d5f6a8c0e1b2d"

const CHAT = {
  id: IDS.chat,
  title: "What can I make with leftover chicken?",
  createdAt: TIMES.created,
  updatedAt: TIMES.now,
}

export const ChatSchema = z
  .object({
    id: z.string(),
    title: z.string().openapi({ description: "From its first message." }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Chat", { example: CHAT })

export const ChatListSchema = z
  .object({ chats: z.array(ChatSchema) })
  .openapi("ChatList", { example: { chats: [CHAT] } })

const MESSAGE = {
  id: IDS.chatMessage,
  role: "user",
  parts: [{ type: "text", text: "What can I make with leftover chicken?" }],
}

export const ChatWithMessagesSchema = ChatSchema.extend({
  messages: z.array(z.record(z.string(), z.unknown())).openapi({
    description:
      "Its messages in order, as AI SDK's UI messages: each with an id, a role, and parts (text, and the assistant's tool calls with their results).",
  }),
}).openapi("ChatWithMessages", { example: { ...CHAT, messages: [MESSAGE] } })

export const ChatParam = z.object({
  chatId: z
    .string()
    .openapi({ param: { name: "chatId", in: "path" }, example: IDS.chat }),
})

export const ChatMessageInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .max(4000, "Keep it under 4,000 characters.")
      .default("")
      .openapi({ description: "What they say. Can be left out with photos." }),
    photos: z
      .array(z.string().regex(/^[a-f0-9]{24}$/, "That isn't a photo's id."))
      .max(MAX_MESSAGE_PHOTOS, `Send ${MAX_MESSAGE_PHOTOS} photos or fewer.`)
      .optional()
      .openapi({
        description: `Photos to send with it, up to ${MAX_MESSAGE_PHOTOS}, by the ids \`POST /assistant/photos\` gave them: of what they're cooking, say. The message keeps them as file parts, linking to each photo.`,
      }),
    context: z
      .object({
        recipe: z.string().optional().openapi({
          description: "The recipe on their screen, by id or address.",
        }),
        week: z.string().optional().openapi({
          description: "The first day of the week of the plan on their screen.",
        }),
      })
      .optional()
      .openapi({
        description:
          'What\'s on their screen, for the assistant to know: "this recipe" is the one there.',
      }),
  })
  .refine((input) => input.text || input.photos?.length, {
    message: "Say something, or add a photo.",
    path: ["text"],
  })
  .openapi("ChatMessageInput", {
    example: {
      text: "Is this thick enough?",
      photos: [PHOTO_ID],
      context: { recipe: IDS.lemonChicken },
    },
  })

export const AssistantPhotoSchema = z
  .object({
    id: z.string(),
    url: z.string().openapi({ description: "Where it's shown from." }),
  })
  .openapi("AssistantPhoto", {
    example: { id: PHOTO_ID, url: `/api/assistant/photos/${PHOTO_ID}` },
  })

export const AssistantPhotoParam = z.object({
  photoId: z
    .string()
    .openapi({ param: { name: "photoId", in: "path" }, example: PHOTO_ID }),
})
