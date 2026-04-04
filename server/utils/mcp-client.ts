import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { H3Event } from 'h3'
import { getMcpServers } from './mcp-config'

export async function createMcpClient(event: H3Event): Promise<Client> {
  const mcpToken = event.context.accessToken as string | undefined
  const server = getMcpServers()[0]
  if (!server) throw createError({ statusCode: 503, statusMessage: 'No MCP server configured' })

  const client = new Client({ name: 'ai-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: { authorization: `Bearer ${mcpToken}` } }
  }))
  return client
}

export async function callMcpTool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string, text: string }[]).find(c => c.type === 'text')?.text ?? '{}'
  return JSON.parse(text) as T
}
