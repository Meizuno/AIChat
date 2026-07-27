import { getRouterParam } from 'h3'
import { z } from 'zod'

const renameSchema = z.object({ title: z.string().trim().min(1).max(200) })

// Rename a chat (scoped to the user).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const chatId = getRouterParam(event, 'id') as string
  const { title } = await readValidatedBody(event, renameSchema.parse)
  const count = await renameChat(userId, chatId, title)
  if (count === 0) throw new NotFound('Chat not found')
  return { ok: true }
})
