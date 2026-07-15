import { describe, it, expect } from 'vitest'
import { mcpStatusColor } from '../../../app/composables/useMcpStatus'
import type { ServerStatus } from '../../../shared/types/mcp'

// Regression guard for the "MCP badge stays green on failure" bug: a caught
// probe error yields an empty `servers` array, and the old check
// `connectedCount === servers.length` was 0 === 0 → green. Empty must be red.
const srv = (connected: boolean): ServerStatus => ({ name: 'x', connected, toolCount: 0, tools: [] })
const status = (servers: ServerStatus[]) => ({ connected: servers.some(s => s.connected), toolCount: 0, tools: [], servers })

describe('mcpStatusColor', () => {
  it('is gray while loading (null status)', () => {
    expect(mcpStatusColor(null)).toBe('#94a3b8')
  })

  it('is red when the probe failed / no servers (empty list)', () => {
    expect(mcpStatusColor(status([]))).toBe('#ef4444')
  })

  it('is green only when every server is connected', () => {
    expect(mcpStatusColor(status([srv(true), srv(true), srv(true)]))).toBe('#22c55e')
  })

  it('is yellow when some but not all are connected', () => {
    expect(mcpStatusColor(status([srv(true), srv(false)]))).toBe('#eab308')
  })

  it('is red when none are connected', () => {
    expect(mcpStatusColor(status([srv(false), srv(false)]))).toBe('#ef4444')
  })
})
