// Wire shape returned by /api/mcp-status. Per-server connectivity
// rows plus the legacy aggregates (`connected`, `toolCount`, `tools`)
// the original client still reads. New code should prefer iterating
// `servers` directly.
export type ServerStatus = {
  name: string
  connected: boolean
  toolCount: number
  tools: string[]
}

export type McpStatus = {
  connected: boolean
  toolCount: number
  tools: string[]
  servers: ServerStatus[]
}
