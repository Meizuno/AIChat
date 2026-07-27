import { getRouterParam } from 'h3'

// Delete a chat and its messages (scoped to the user).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const chatId = getRouterParam(event, 'id') as string
  const count = await deleteChat(userId, chatId)
  if (count === 0) throw new NotFound('Chat not found')
  return { ok: true }
})
