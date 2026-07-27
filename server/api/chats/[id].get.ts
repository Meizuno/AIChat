import { getRouterParam } from 'h3'

// Fetch one chat (scoped to the user) with its messages in order.
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const chatId = getRouterParam(event, 'id') as string
  const chat = await getChat(userId, chatId)
  if (!chat) throw new NotFound('Chat not found')
  return chat
})
