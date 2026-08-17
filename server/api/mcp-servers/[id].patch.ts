import { getRouterParam } from 'h3'
import { updateMcpServerSchema } from '#shared/schemas/mcp-servers'

// Update one of the user's MCP servers (name/url/useAuth/enabled), scoped.
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const id = getRouterParam(event, 'id') as string
  const patch = await readValidatedBody(event, updateMcpServerSchema.parse)
  const count = await updateUserMcpServer(userId, id, patch)
  if (count === 0) throw new NotFound('MCP server not found')
  return { ok: true }
})
