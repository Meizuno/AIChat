import { describe, it, expect } from 'vitest'
import { isError } from 'h3'
import {
  DomainError,
  McpUnavailable,
  Unauthorized
} from '../../../server/utils/errors'

describe('domain errors', () => {
  it('Unauthorized carries a 401', () => {
    const err = new Unauthorized()
    expect(err.statusCode).toBe(401)
    expect(err.statusMessage).toBe('Unauthorized')
    expect(err.name).toBe('Unauthorized')
    expect(err).toBeInstanceOf(DomainError)
  })

  it('McpUnavailable carries a 503 and the server name in its message', () => {
    const err = new McpUnavailable('Notes')
    expect(err.statusCode).toBe(503)
    expect(err.statusMessage).toBe('MCP server unavailable')
    expect(err.message).toContain('Notes')
  })

  it('are recognized as H3 errors so Nitro renders the right status', () => {
    // isError keys off the H3Error brand; if this is false, Nitro
    // would treat the throw as an unhandled 500 instead of the
    // carried status.
    expect(isError(new Unauthorized())).toBe(true)
    expect(isError(new McpUnavailable())).toBe(true)
  })
})
