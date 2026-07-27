// List the signed-in user's chats (newest-first, titles only).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  return listChats(userId)
})
