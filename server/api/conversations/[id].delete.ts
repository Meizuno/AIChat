export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')!

  await getPrisma().conversation.deleteMany({ where: { id, userId: user.id } })

  return { ok: true }
})
