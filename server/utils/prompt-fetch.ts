import type { H3Event } from 'h3'
import { getMcpServers } from './mcp-config'

/** Get base URL for a service (strips /api/mcp from MCP URL) */
function getServiceUrl(serverName: string): string {
  const servers = getMcpServers()
  const server = servers.find(s => s.name === serverName)
  if (!server) throw createError({ statusCode: 503, statusMessage: `Service "${serverName}" not found` })
  return server.url.replace(/\/api\/mcp$/, '')
}

/** Fetch from a service's prompt endpoint with API key auth */
export async function fetchPrompt<T>(event: H3Event, serverName: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const config = useRuntimeConfig()
  const userId = (event.context.user as { id: string })?.id
  const baseUrl = getServiceUrl(serverName)

  return $fetch<T>(`${baseUrl}${path}`, {
    params,
    headers: {
      'x-api-key': config.mcpApiKey,
      'x-user-id': userId ?? ''
    }
  })
}
