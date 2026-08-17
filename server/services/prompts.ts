import type { H3Event } from 'h3'
import { McpUnavailable, Unauthorized } from '../utils/errors'

// Forward a /api/prompts/<x> call to the MCP server that owns the named tool.
// Each server can expose a structured-prompt route alongside its MCP endpoint;
// we proxy it, sending the user's Bearer access token only when that server has
// `useAuth` enabled (the same rule the chat tools follow — see mcp-client).
//
// The named server is resolved from the user's OWN registered servers (there are
// no built-in servers). If the user hasn't added a server by that name, the
// proxy 503s. The wire shape is forwarded as-is — each upstream picks its own
// response (a chart payload, a list snapshot, …). Generic on the payload.

export async function fetchPromptThrough<T = unknown>(
  event: H3Event,
  serverName: string,
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  await requireAuthUser(event)
  const userId = viewerId(event)
  if (!userId) throw new Unauthorized()

  const server = (await listUserMcpServers(userId)).find(s => s.enabled && s.name === serverName)
  if (!server) throw new McpUnavailable(serverName)
  const baseUrl = server.url.replace(/\/api\/mcp$/, '')

  const headers: Record<string, string> = {}
  if (server.useAuth) headers.authorization = `Bearer ${event.context.accessToken ?? ''}`

  // $fetch's generic narrows to TypedInternalResponse for known internal routes;
  // for an arbitrary external upstream that pre-narrowed shape collapses back to
  // the caller's T, but TS can't prove it. Pass through `unknown` to assert intent.
  const result = await $fetch(`${baseUrl}${path}`, { params, headers })
  return result as T
}
