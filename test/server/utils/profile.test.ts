import { describe, it, expect } from 'vitest'
import { isDisallowedAddress } from '../../../server/utils/profile'

describe('isDisallowedAddress', () => {
  it('rejects loopback', () => {
    expect(isDisallowedAddress('127.0.0.1')).toBe(true)
    expect(isDisallowedAddress('127.5.5.5')).toBe(true)
    expect(isDisallowedAddress('::1')).toBe(true)
  })

  it('rejects link-local (169.254/16 and fe80::/10)', () => {
    expect(isDisallowedAddress('169.254.169.254')).toBe(true) // cloud metadata
    expect(isDisallowedAddress('fe80::1')).toBe(true)
  })

  it('rejects each private range', () => {
    expect(isDisallowedAddress('10.0.0.5')).toBe(true) // 10/8
    expect(isDisallowedAddress('172.16.0.1')).toBe(true) // 172.16/12
    expect(isDisallowedAddress('172.31.255.255')).toBe(true)
    expect(isDisallowedAddress('192.168.1.1')).toBe(true) // 192.168/16
    expect(isDisallowedAddress('fc00::1')).toBe(true) // fc00::/7
    expect(isDisallowedAddress('fd12::34')).toBe(true)
  })

  it('rejects 0.0.0.0 / :: and IPv4-mapped internals', () => {
    expect(isDisallowedAddress('0.0.0.0')).toBe(true)
    expect(isDisallowedAddress('::')).toBe(true)
    expect(isDisallowedAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('rejects non-IP strings', () => {
    expect(isDisallowedAddress('example.com')).toBe(true)
    expect(isDisallowedAddress('')).toBe(true)
  })

  it('allows public addresses', () => {
    expect(isDisallowedAddress('93.184.216.34')).toBe(false) // example.com
    expect(isDisallowedAddress('1.1.1.1')).toBe(false)
    expect(isDisallowedAddress('8.8.8.8')).toBe(false)
    expect(isDisallowedAddress('2606:4700:4700::1111')).toBe(false) // cloudflare v6
    expect(isDisallowedAddress('172.32.0.1')).toBe(false) // just outside 172.16/12
  })
})
