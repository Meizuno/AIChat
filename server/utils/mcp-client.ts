import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { H3Event } from 'h3'
import { getMcpServers } from './mcp-config'

// Persistent pool keyed by userId:serverUrl — connections live across requests
const pool = new Map<string, Client>()

async function getOrCreateClient(userId: string, serverUrl: string): Promise<Client> {
  const key = `${userId}:${serverUrl}`
  const existing = pool.get(key)
  if (existing) return existing

  const config = useRuntimeConfig()
  const client = new Client({ name: 'ai-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: {
        'x-api-key': config.mcpApiKey,
        'x-user-id': userId
      }
    }
  }))

  const originalClose = client.close.bind(client)
  client.close = async () => {
    pool.delete(key)
    return originalClose()
  }

  pool.set(key, client)
  return client
}

export async function createMcpClient(event: H3Event, serverName?: string): Promise<Client> {
  const userId = viewerId(event)
  if (!userId) throw new Unauthorized()

  const servers = getMcpServers()
  const server = serverName
    ? servers.find(s => s.name === serverName)
    : servers[0]
  if (!server) throw new McpUnavailable(serverName)
  return getOrCreateClient(userId, server.url)
}
