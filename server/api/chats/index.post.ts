// Create a new empty chat for the signed-in user (the "New chat" action).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  return createChat(userId)
})
