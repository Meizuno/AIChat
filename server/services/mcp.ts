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
  const tools: ToolSet = {}
  for (const server of getMcpServers()) {
    try {
      const client = await createMcpClient(event, server.name)
      const { tools: mcpTools } = await client.listTools()
      const adapted = Object.fromEntries(mcpTools.map((t) => {
        const raw = t.inputSchema as Record<string, unknown>
        // Strip JSON-Schema meta we don't want to forward to the model.
        const { $schema: _schemaUrl, additionalProperties: _addProps, ...rest } = raw
        void _schemaUrl
        void _addProps
        const normalized: Record<string, unknown> = {
          ...rest,
          type: 'object',
          properties: (rest?.properties as Record<string, unknown>) ?? {},
          required: (rest?.required as string[]) ?? []
        }
        return [
          t.name,
          tool({
            description: t.description ?? '',
            inputSchema: jsonSchema(normalized),
            execute: async (args) => {
              const result = await client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> })
              return result.content
            }
          })
        ]
      }))
      Object.assign(tools, adapted)
    } catch (err) {
      console.warn(`[MCP] Could not connect to ${server.name}, skipping:`, (err as Error).message)
    }
  }
  return tools
}
