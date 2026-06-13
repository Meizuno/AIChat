import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { tool, jsonSchema } from 'ai'
import type { ToolSet } from 'ai'
import type { H3Event } from 'h3'
import type { McpStatus, ServerStatus } from '#shared/types/mcp'

// Service layer for the configured MCP servers. Two distinct
// surfaces both live here because they share the same per-server
// iteration shape:
//
// - `probeMcpServers` — used by /api/mcp-status to show the popover.
//   Spins up a throwaway client per server, lists tools, closes.
//   Per-server failures stay soft (`connected: false` rows).
//
// - `getChatTools` — used by /api/chat. Reuses the pooled client per
//   server (createMcpClient) and converts the listTools result into
//   the shape the `ai` SDK's `streamText({ tools })` expects.

/** Status snapshot for every configured MCP server, plus the aggregates the old client reads. */
export async function probeMcpServers(event: H3Event): Promise<McpStatus> {
  await requireAuthUser(event)
  const mcpToken = event.context.accessToken
  const servers = getMcpServers()

  const results: ServerStatus[] = await Promise.all(
    servers.map(async (server) => {
      try {
        const client = new Client({ name: 'ai-chat-status', version: '1.0.0' })
        await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers: { authorization: `Bearer ${mcpToken}` } }
        }))
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
      const client = await createMcpClient(event, server.name)
      const { tools: mcpTools } = await client.listTools()
      for (const t of mcpTools) {
        // Namespace the KEY the model sees so identically-named tools on
        // different servers don't overwrite each other. The closure below
        // still calls the ORIGINAL tool name on THIS server's client.
        tools[namespaceToolName(slug, t.name)] = tool({
          description: t.description ?? '',
          inputSchema: jsonSchema(forwardInputSchema(t.inputSchema)),
          execute: async (args) => {
            const result = await client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> })
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
