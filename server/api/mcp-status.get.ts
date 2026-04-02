import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { requireAuthUser } from '../utils/auth'
import { getMcpServers } from '../utils/mcp-config'

type ServerStatus = { name: string, connected: boolean, toolCount: number, tools: string[] }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const mcpToken = event.context.accessToken as string | undefined
  const servers = getMcpServers()

  const results: ServerStatus[] = await Promise.all(
    servers.map(async (server) => {
      try {
        const client = new Client({ name: 'ai-chat-status', version: '1.0.0' })
        await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers: { authorization: `Bearer ${mcpToken}` } }
        }))
        const { tools } = await client.listTools()
        await client.close()
        return { name: server.name, connected: true, toolCount: tools.length, tools: tools.map(t => t.name) }
      }
      catch {
        return { name: server.name, connected: false, toolCount: 0, tools: [] }
      }
    })
  )

  // Aggregate for backwards compatibility
  const connected = results.some(r => r.connected)
  const toolCount = results.reduce((sum, r) => sum + r.toolCount, 0)
  const tools = results.flatMap(r => r.tools)

  return { connected, toolCount, tools, servers: results }
})
