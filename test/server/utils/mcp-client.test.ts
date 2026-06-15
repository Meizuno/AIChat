import { describe, it, expect } from 'vitest'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { isMcpAuthError } from '../../../server/utils/mcp-client'

// isMcpAuthError gates the stale-Bearer reconnect in withMcpClient: only
// a true 401 from the transport should trigger a drop-and-reconnect, and
// every other failure must propagate untouched so it surfaces as a normal
// failed tool call.
describe('isMcpAuthError', () => {
  it('is true for a StreamableHTTPError carrying a 401 code', () => {
    expect(isMcpAuthError(new StreamableHTTPError(401, 'Unauthorized'))).toBe(true)
  })

  it('is false for other StreamableHTTPError codes', () => {
    expect(isMcpAuthError(new StreamableHTTPError(403, 'forbidden'))).toBe(false)
    expect(isMcpAuthError(new StreamableHTTPError(500, 'boom'))).toBe(false)
  })

  it('is true for a duck-typed error carrying code 401', () => {
    // Errors may reach us wrapped; a plain { code: 401 } still counts.
    expect(isMcpAuthError({ code: 401 })).toBe(true)
  })

  it('is false for plain errors and non-401 shapes', () => {
    expect(isMcpAuthError(new Error('network down'))).toBe(false)
    expect(isMcpAuthError({ status: 401 })).toBe(false)
    expect(isMcpAuthError(null)).toBe(false)
    expect(isMcpAuthError(undefined)).toBe(false)
  })
})
