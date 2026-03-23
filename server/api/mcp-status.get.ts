import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { requireAuthUser } from '../utils/auth'


export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const { mcpUrl } = useRuntimeConfig(event)
  const mcpToken = event.context.accessToken as string | undefined

  try {
    const client = new Client({ name: 'ai-chat-status', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${mcpToken}` } }
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
