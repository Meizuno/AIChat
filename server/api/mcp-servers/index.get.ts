// List the signed-in user's own MCP servers (for the settings list).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  return listUserMcpServers(userId)
})
