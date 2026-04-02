import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type McpServerConfig = { name: string, url: string }

let cached: McpServerConfig[] | null = null

export function getMcpServers(): McpServerConfig[] {
  if (cached) return cached

  const filePath = resolve(process.cwd(), 'mcp-servers.json')
  try {
    const raw = readFileSync(filePath, 'utf-8')
    cached = JSON.parse(raw) as McpServerConfig[]
  }
  catch {
    cached = []
  }

  return cached
}
