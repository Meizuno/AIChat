import type { H3Event } from 'h3'
import { McpUnavailable } from '../utils/errors'

// Forward a /api/prompts/<x> call to the upstream MCP service that
// owns the named tool. Each tool exposes a structured-prompt route
// alongside its MCP endpoint; we proxy it with the same API key +
// `x-user-id` headers the chat tools use.
//
// The wire shape is forwarded as-is — each upstream picks its own
// response (a chart payload, a list snapshot, …) and the client
// embeds the JSON in a fenced block whose language matches the
// `component` field. Generic on the payload so the caller types it.

function getServiceBaseUrl(serverName: string): string {
  const server = getMcpServers().find(s => s.name === serverName)
  if (!server) throw new McpUnavailable(serverName)
  return server.url.replace(/\/api\/mcp$/, '')
}

export async function fetchPromptThrough<T = unknown>(
  event: H3Event,
  serverName: string,
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  await requireAuthUser(event)
  const { mcpApiKey } = useRuntimeConfig(event)
  const userId = viewerId(event)
  const baseUrl = getServiceBaseUrl(serverName)

  // $fetch's generic narrows to TypedInternalResponse when the URL is
  // a known internal route; for an arbitrary external upstream that
  // pre-narrowed shape collapses back to the caller's T, but TS can't
  // prove it. Pass through `unknown` to assert the intent.
  const result = await $fetch(`${baseUrl}${path}`, {
    params,
    headers: {
      'x-api-key': mcpApiKey,
      'x-user-id': userId ?? ''
    }
  })
  return result as T
}
