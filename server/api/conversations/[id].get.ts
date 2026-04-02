export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')!

  const conversation = await getPrisma().conversation.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true } }
    }
  })

  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  return { conversation }
})
