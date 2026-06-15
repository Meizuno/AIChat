import { tool, jsonSchema } from 'ai'
import type { ToolSet } from 'ai'
import type { H3Event } from 'h3'
import type { McpStatus, ServerStatus } from '#shared/types/mcp'

// Service layer for the configured MCP servers. Two distinct
// surfaces both live here because they share the same per-server
// iteration shape, and both authenticate to every server with the
// user's Bearer access token via the shared connection factory in
// server/utils/mcp-client (connectMcpClient / withMcpClient):
//
// - `probeMcpServers` — used by /api/mcp-status to show the popover.
//   Spins up a throwaway client per server, lists tools, closes.
//   Per-server failures stay soft (`connected: false` rows).
//
// - `getChatTools` — used by /api/chat. Reuses the pooled client per
//   server (withMcpClient) and converts the listTools result into
//   the shape the `ai` SDK's `streamText({ tools })` expects.

/** Status snapshot for every configured MCP server, plus the aggregates the old client reads. */
export async function probeMcpServers(event: H3Event): Promise<McpStatus> {
  await requireAuthUser(event)
  const mcpToken = event.context.accessToken ?? ''
  const servers = getMcpServers()

  const results: ServerStatus[] = await Promise.all(
    servers.map(async (server) => {
      try {
        const client = await connectMcpClient(server.url, mcpToken)
        const { tools } = await client.listTools()
        await client.close()
        return { name: server.name, connected: true, toolCount: tools.length, tools: tools.map(t => t.name) }
      } catch {
        return { name: server.name, connected: false, toolCount: 0, tools: [] }
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
 * Discover the chat-callable tools across every configured MCP server.
 * Failures of any one server are logged and skipped — chat stays usable
 * even when one upstream is down (the model just has fewer tools).
 */
export async function getChatTools(event: H3Event): Promise<ToolSet> {
  const servers = getMcpServers()
  // Slugs are computed across ALL servers up front so the de-dup
  // suffixing is stable even if a later server fails to connect.
  const slugs = buildServerSlugs(servers.map(s => s.name))

  const tools: ToolSet = {}
  for (const [i, server] of servers.entries()) {
    const slug = slugs[i]!
    try {
      const { tools: mcpTools } = await withMcpClient(event, server.name, c => c.listTools())
      for (const t of mcpTools) {
        // Namespace the KEY the model sees so identically-named tools on
        // different servers don't overwrite each other. The closure below
        // still calls the ORIGINAL tool name on THIS server's client and
        // resolves it through withMcpClient at call time, so a stale
        // pooled Bearer reconnects rather than failing the turn.
        tools[namespaceToolName(slug, t.name)] = tool({
          description: t.description ?? '',
          inputSchema: jsonSchema(forwardInputSchema(t.inputSchema)),
          execute: async (args) => {
            const result = await withMcpClient(event, server.name, c =>
              c.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> }))
            return flattenToolResult(result)
          }
        })
      }
    } catch (err) {
      console.warn(`[MCP] Could not connect to ${server.name}, skipping:`, (err as Error).message)
    }
  }
  return tools
}
