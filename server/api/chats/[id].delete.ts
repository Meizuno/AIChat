import { getRouterParam } from 'h3'

// Delete a chat, its messages, and its on-disk image blobs (scoped to the user).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const chatId = getRouterParam(event, 'id') as string
  const count = await removeChat(userId, chatId)
  if (count === 0) throw new NotFound('Chat not found')
  return { ok: true }
})
