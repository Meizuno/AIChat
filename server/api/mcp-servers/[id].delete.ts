import { getRouterParam } from 'h3'

// Delete one of the user's MCP servers (scoped).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const id = getRouterParam(event, 'id') as string
  const count = await deleteUserMcpServer(userId, id)
  if (count === 0) throw new NotFound('MCP server not found')
  return { ok: true }
})
