import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { requireAuthUser, getAccessTokenFromRequest } from '../utils/auth'

const MCP_URL = 'http://localhost:3001/api/mcp'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const token = getAccessTokenFromRequest(event)

  try {
    const client = new Client({ name: 'ai-chat-status', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    }))
    const { tools } = await client.listTools()
    await client.close()

    return {
      connected: true,
      toolCount: tools.length,
      tools: tools.map(t => t.name)
    }
  }
  catch {
    return { connected: false, toolCount: 0, tools: [] }
  }
})
