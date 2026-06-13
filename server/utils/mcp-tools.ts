// Pure transforms for adapting MCP tool definitions/results into the
// shape the `ai` SDK expects. Kept free of H3/network concerns so the
// collision-namespacing, result-flattening, and schema-forwarding logic
// is unit-testable in isolation (see test/server/utils/mcp-tools.test.ts).
// The service layer (server/services/mcp.ts) wires these to live clients.

/** Provider tool-name limit (OpenAI function names cap at 64 chars). */
const MAX_TOOL_NAME_LENGTH = 64

/** A single block of an MCP tool-call result. */
export type McpContentBlock = {
  type: string
  text?: string
  [key: string]: unknown
}

/**
 * The slice of an MCP `callTool` result this module cares about. The
 * index signature keeps it assignable from the SDK's broad result union
 * (which has a no-`content` compatibility variant) without a cast.
 */
export type McpToolResult = {
  content?: unknown
  isError?: boolean
  [key: string]: unknown
}

/**
 * Sanitize a server name into a slug matching /^[a-zA-Z0-9_-]+$/.
 * Runs of disallowed characters collapse to a single underscore; a
 * name that sanitizes to nothing falls back to `server`.
 */
export function slugifyServerName(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'server'
}

/**
 * Build a stable, collision-free slug per server, in input order.
 * Two names that sanitize to the same slug are de-duplicated with a
 * numeric suffix (`base`, `base_2`, `base_3`, …).
 */
export function buildServerSlugs(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = slugifyServerName(name)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}_${count}`
  })
}

/**
 * Namespace a tool name under its server slug so identically-named
 * tools on different servers don't collide: `${slug}__${toolName}`.
 * Clamped to the provider limit, trimming the tool-name side first so
 * the slug prefix (the routing-relevant part for humans) is preserved.
 */
export function namespaceToolName(slug: string, toolName: string): string {
  const prefix = `${slug}__`
  const full = prefix + toolName
  if (full.length <= MAX_TOOL_NAME_LENGTH) return full
  if (prefix.length >= MAX_TOOL_NAME_LENGTH) return full.slice(0, MAX_TOOL_NAME_LENGTH)
  return prefix + toolName.slice(0, MAX_TOOL_NAME_LENGTH - prefix.length)
}

/**
 * Forward an MCP tool's input schema to the model faithfully — keep
 * `$schema`, `additionalProperties`, `$ref`/`$defs`, etc. intact so
 * strict argument validation and reference-based schemas survive.
 * Only substitutes a minimal object schema when the tool declares none.
 */
export function forwardInputSchema(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'object') {
    return raw as Record<string, unknown>
  }
  return { type: 'object', properties: {} }
}

/**
 * Flatten MCP content blocks into clean text: text blocks are joined
 * with newlines; non-text blocks (image/resource/…) become short
 * placeholders rather than dumped raw objects.
 */
export function flattenContentBlocks(content: unknown): string {
  const blocks: McpContentBlock[] = Array.isArray(content) ? content : []
  return blocks
    .map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') return block.text
      return `[${block.type ?? 'unknown'}]`
    })
    .join('\n')
}

/**
 * Turn an MCP tool result into the value the model should see. A result
 * flagged `isError` is thrown (carrying its text) so the AI SDK surfaces
 * it as a failed tool call the model can react to; otherwise the content
 * is flattened to text.
 */
export function flattenToolResult(result: McpToolResult): string {
  const text = flattenContentBlocks(result.content)
  if (result.isError) {
    throw new Error(text || 'MCP tool call failed')
  }
  return text
}
