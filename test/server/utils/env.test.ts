import { describe, it, expect } from 'vitest'
import { envSchema } from '../../../server/utils/env'

const valid = {
  NUXT_OPENAI_API_KEY: 'sk-test-1234567890',
  NUXT_AUTH_SERVICE_URL: 'https://auth.example.com'
}

describe('envSchema', () => {
  it('accepts a valid environment and ignores unrelated keys', () => {
    const result = envSchema.safeParse({ ...valid, PATH: '/usr/bin', HOME: '/root' })
    expect(result.success).toBe(true)
  })

  it('rejects a missing OpenAI key', () => {
    const partial = { NUXT_AUTH_SERVICE_URL: valid.NUXT_AUTH_SERVICE_URL }
    expect(envSchema.safeParse(partial).success).toBe(false)
  })

  it('rejects a non-URL auth service value', () => {
    const bad = { ...valid, NUXT_AUTH_SERVICE_URL: 'not-a-url' }
    expect(envSchema.safeParse(bad).success).toBe(false)
  })
})
