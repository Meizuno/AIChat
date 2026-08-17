import { createMcpServerSchema } from '#shared/schemas/mcp-servers'

// Register a new MCP server for the signed-in user.
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const body = await readValidatedBody(event, createMcpServerSchema.parse)
  return createUserMcpServer(userId, body)
})
