import { tool, jsonSchema } from 'ai'
import type { ToolSet } from 'ai'
import type { H3Event } from 'h3'
import type { McpStatus, ServerStatus } from '#shared/types/mcp'

// Service layer for the user's effective MCP servers — their own registered
// servers (getEffectiveMcpTargets); there are no built-in servers. Two surfaces
// share the same per-server iteration:
//
// - `probeMcpServers` — /api/mcp-status. A throwaway client per server lists
//   its tools, then closes. Per-server failures stay soft (`connected: false`).
//
// - `getChatTools` — /api/chat. Reuses the pooled client (withMcpClient) and
//   converts each server's live listTools() into the `ai` SDK ToolSet. Tools
//   are always fetched live — never stored.

/** Status snapshot for every effective MCP server, plus the aggregates the client reads. */
export async function probeMcpServers(event: H3Event): Promise<McpStatus> {
  const { id: userId } = await requireAuthUser(event)
  const targets = await getEffectiveMcpTargets(userId)
  const ssoToken = event.context.accessToken ?? ''

  const results: ServerStatus[] = await Promise.all(
    targets.map(async (target) => {
      try {
        const client = await connectMcpClient(target.url, target.useAuth ? ssoToken : undefined)
        const { tools } = await client.listTools()
        await client.close()
        return { name: target.name, connected: true, toolCount: tools.length, tools: tools.map(t => t.name) }
      } catch {
        return { name: target.name, connected: false, toolCount: 0, tools: [] }
      }
    })
  )

  return {
    connected: results.some(r => r.connected),
    toolCount: results.reduce((sum, r) => sum + r.toolCount, 0),
    tools: results.flatMap(r => r.tools),
    servers: results
  }
}

/**
 * Discover the chat-callable tools across every effective MCP server. Failures
 * of any one server are logged and skipped — chat stays usable when one upstream
 * is down (the model just has fewer tools).
 */
export async function getChatTools(event: H3Event): Promise<ToolSet> {
  const { id: userId } = await requireAuthUser(event)
  const targets = await getEffectiveMcpTargets(userId)
  // Slugs computed across ALL servers up front so the de-dup suffixing is stable
  // even if a later server fails to connect.
  const slugs = buildServerSlugs(targets.map(t => t.name))

  const tools: ToolSet = {}
  for (const [i, target] of targets.entries()) {
    const slug = slugs[i]!
    try {
      const { tools: mcpTools } = await withMcpClient(event, target, c => c.listTools())
      for (const t of mcpTools) {
        // Namespace the KEY the model sees so identically-named tools on
        // different servers don't overwrite each other. The closure still calls
        // the ORIGINAL tool name on THIS server's client, resolved through
        // withMcpClient at call time so a stale pooled token reconnects.
        tools[namespaceToolName(slug, t.name)] = tool({
          description: t.description ?? '',
          inputSchema: jsonSchema(forwardInputSchema(t.inputSchema)),
          execute: async (args) => {
            const result = await withMcpClient(event, target, c =>
              c.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> }))
            return flattenToolResult(result)
          }
        })
      }
    } catch (err) {
      console.warn(`[MCP] Could not connect to ${target.name}, skipping:`, (err as Error).message)
    }
  }
  return tools
}
