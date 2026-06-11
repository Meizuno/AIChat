import { chatBodySchema } from '#shared/schemas/chat'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, chatBodySchema.parse)
  return streamChatResponse(event, body)
})
