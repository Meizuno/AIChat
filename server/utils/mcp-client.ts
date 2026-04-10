import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { H3Event } from 'h3'
import { getMcpServers } from './mcp-config'

// Per-token singleton pool — reuses live connections across requests
const pool = new Map<string, Client>()

async function getOrCreateClient(token: string, serverUrl: string): Promise<Client> {
  const key = `${token}:${serverUrl}`
  const existing = pool.get(key)
  if (existing) return existing

  const client = new Client({ name: 'ai-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers: { authorization: `Bearer ${token}` } }
  }))

  // Remove from pool on close
  const originalClose = client.close.bind(client)
  client.close = async () => {
    pool.delete(key)
    return originalClose()
  }

  pool.set(key, client)
  return client
}

export async function createMcpClient(event: H3Event): Promise<Client> {
  const token = (event.context.accessToken as string | undefined) ?? ''
  const server = getMcpServers()[0]
  if (!server) throw createError({ statusCode: 503, statusMessage: 'No MCP server configured' })
  return getOrCreateClient(token, server.url)
}

export async function callMcpTool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string, text: string }[]).find(c => c.type === 'text')?.text ?? '{}'
  if (result.isError) throw createError({ statusCode: 502, statusMessage: text })
  return JSON.parse(text) as T
}
