import { describe, it, expect } from 'vitest'
import { updateSettingsSchema } from '../../../shared/schemas/settings'

describe('updateSettingsSchema.profileUrl', () => {
  const accepts = (u: string) => updateSettingsSchema.safeParse({ profileUrl: u }).success

  it('accepts an https url', () => {
    expect(accepts('https://example.com/llms.txt')).toBe(true)
  })

  it('rejects an http url', () => {
    expect(accepts('http://example.com/llms.txt')).toBe(false)
  })

  it('accepts an empty string (clears the setting)', () => {
    expect(accepts('')).toBe(true)
  })

  it('rejects a malformed url', () => {
    expect(accepts('not a url')).toBe(false)
  })

  it('rejects other schemes', () => {
    expect(accepts('ftp://example.com/x')).toBe(false)
    expect(accepts('file:///etc/passwd')).toBe(false)
  })
})
