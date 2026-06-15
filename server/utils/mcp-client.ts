import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { H3Event } from 'h3'
import { getMcpServers } from './mcp-config'

// Persistent pool keyed by userId:serverUrl — connections live across
// requests so each chat turn doesn't re-handshake every server.
const pool = new Map<string, Client>()

const poolKey = (userId: string, serverUrl: string) => `${userId}:${serverUrl}`

/**
 * Connect a fresh MCP client to `serverUrl`, authenticating with the
 * user's Bearer access token. This is the single source of truth for
 * how AIChat authenticates to every MCP server — used by both the
 * status probe (throwaway clients) and the chat tool path (pooled), so
 * the two can never diverge on auth again.
 */
export async function connectMcpClient(serverUrl: string, accessToken: string): Promise<Client> {
  const client = new Client({ name: 'ai-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } }
  }))
  return client
}

async function getOrCreateClient(userId: string, serverUrl: string, accessToken: string): Promise<Client> {
  const key = poolKey(userId, serverUrl)
  const existing = pool.get(key)
  if (existing) return existing

  const client = await connectMcpClient(serverUrl, accessToken)
  const originalClose = client.close.bind(client)
  client.close = async () => {
    pool.delete(key)
    return originalClose()
  }

  pool.set(key, client)
  return client
}

/** Drop a pooled client and best-effort close its underlying connection. */
async function dropClient(userId: string, serverUrl: string): Promise<void> {
  const client = pool.get(poolKey(userId, serverUrl))
  if (!client) return
  pool.delete(poolKey(userId, serverUrl))
  try {
    await client.close()
  } catch {
    // Connection may already be dead — nothing to clean up.
  }
}

/** True when an MCP transport error is an upstream 401 (a stale Bearer). */
export function isMcpAuthError(err: unknown): boolean {
  if (err instanceof StreamableHTTPError) return err.code === 401
  return (err as { code?: unknown } | null)?.code === 401
}

function requireAccessToken(event: H3Event): string {
  const token = event.context.accessToken
  if (!token) throw new Unauthorized()
  return token
}

function resolveServer(serverName?: string) {
  const servers = getMcpServers()
  const server = serverName ? servers.find(s => s.name === serverName) : servers[0]
  if (!server) throw new McpUnavailable(serverName)
  return server
}

/**
 * Run an operation against the pooled MCP client for (user, server),
 * authenticating with the request's current Bearer token.
 *
 * The pooled Bearer is fixed at connect time and access tokens expire
 * (~15 min), so a pooled connection can carry a stale token and 401
 * mid-turn. On an auth error we drop the pooled client and reconnect
 * once with the request's current token; if that still 401s — the
 * request's own token outlived the turn — we refresh the session and
 * reconnect a final time. Non-auth errors propagate untouched so a
 * failed tool call still surfaces to the model.
 */
export async function withMcpClient<T>(
  event: H3Event,
  serverName: string | undefined,
  op: (client: Client) => Promise<T>
): Promise<T> {
  const userId = viewerId(event)
  if (!userId) throw new Unauthorized()
  const server = resolveServer(serverName)

  const run = async (reconnect: boolean): Promise<T> => {
    if (reconnect) await dropClient(userId, server.url)
    return op(await getOrCreateClient(userId, server.url, requireAccessToken(event)))
  }

  try {
    return await run(false)
  } catch (err) {
    if (!isMcpAuthError(err)) throw err
  }

  // Pooled Bearer was stale — reconnect once with the current token.
  try {
    return await run(true)
  } catch (err) {
    if (!isMcpAuthError(err)) throw err
  }

  // Still 401: the request's own token expired mid-turn. Refresh the
  // session, then reconnect a final time with the fresh token.
  await tryRefresh(event)
  return run(true)
}
