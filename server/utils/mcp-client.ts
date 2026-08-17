import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { H3Event } from 'h3'
import type { McpTarget } from './mcp-servers'

// Persistent pool keyed by userId:serverUrl — connections live across
// requests so each chat turn doesn't re-handshake every server.
const pool = new Map<string, Client>()

const poolKey = (userId: string, serverUrl: string) => `${userId}:${serverUrl}`

/**
 * Connect a fresh MCP client to `serverUrl`. `accessToken` is sent as a Bearer
 * when present and omitted otherwise — user sources may carry their own token
 * or none, and only global sources ever receive the SSO token (the auth is
 * resolved per-source by resolveSourceAuthToken). This is the single source of
 * truth for how AIChat connects, shared by the status probe (throwaway clients)
 * and the chat tool path (pooled), so the two can never diverge.
 */
export async function connectMcpClient(serverUrl: string, accessToken?: string): Promise<Client> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  const client = new Client({ name: 'ai-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers }
  }))
  return client
}

async function getOrCreateClient(userId: string, serverUrl: string, accessToken?: string): Promise<Client> {
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

/**
 * Run an operation against the pooled MCP client for (user, target). The Bearer
 * is the caller's SSO access token when `target.useAuth` is set, otherwise no
 * auth header is sent.
 *
 * The pooled token is fixed at connect time and access tokens expire, so a
 * pooled connection can 401 mid-turn. On an auth error we drop the pooled client
 * and reconnect once with the current token. If that still 401s AND this target
 * uses auth, the request's own session token expired mid-turn — refresh it and
 * reconnect a final time. A no-auth target that 401s is genuinely unauthorized
 * (surfaced). Non-auth errors propagate untouched so a failed call reaches the model.
 */
export async function withMcpClient<T>(
  event: H3Event,
  target: McpTarget,
  op: (client: Client) => Promise<T>
): Promise<T> {
  const userId = viewerId(event)
  if (!userId) throw new Unauthorized()

  const token = () => (target.useAuth ? (event.context.accessToken ?? undefined) : undefined)
  const run = async (reconnect: boolean): Promise<T> => {
    if (reconnect) await dropClient(userId, target.url)
    return op(await getOrCreateClient(userId, target.url, token()))
  }

  try {
    return await run(false)
  } catch (err) {
    if (!isMcpAuthError(err)) throw err
  }

  // Pooled token was stale — reconnect once with the current token.
  try {
    return await run(true)
  } catch (err) {
    if (!isMcpAuthError(err)) throw err
  }

  // Still 401. Only an authed target benefits from a session refresh.
  if (target.useAuth) {
    await tryRefresh(event)
    return run(true)
  }
  throw new Unauthorized()
}
