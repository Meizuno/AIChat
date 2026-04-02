export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)

  const conversations = await getPrisma().conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  })

  return { conversations }
})
