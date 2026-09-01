import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConsoleFileLogger, formatLogLine } from '../../../server/utils/logger'

describe('formatLogLine', () => {
  it('emits <message> level=<lvl> then key=value fields', () => {
    expect(formatLogLine('info', 'http', {
      'request-id': 'abc',
      'method': 'GET',
      'path': '/api/chat',
      'response': 200,
      'execution': '12ms'
    })).toBe('http level=info request-id=abc method=GET path=/api/chat response=200 execution=12ms')
  })

  it('quotes values with whitespace/quotes/= and drops undefined', () => {
    expect(formatLogLine('warn', 'profile could not fetch', {
      url: 'https://x.test',
      error: 'connect timed out',
      missing: undefined
    })).toBe('profile could not fetch level=warn url=https://x.test error="connect timed out"')
  })
})

describe('createConsoleFileLogger', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'logtest-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('routes each level to its own file and to the console', async () => {
    const logger = createConsoleFileLogger(dir)
    logger.info('http', { response: 200 })
    logger.warn('http', { response: 404 })
    logger.error('boom', { reason: 'kaboom' })
    await logger.close()

    expect(await readFile(join(dir, 'info.log'), 'utf8')).toBe('http level=info response=200\n')
    expect(await readFile(join(dir, 'warning.log'), 'utf8')).toBe('http level=warn response=404\n')
    expect(await readFile(join(dir, 'error.log'), 'utf8')).toBe('boom level=error reason=kaboom\n')
    // Errors don't leak into info.log.
    expect(await readFile(join(dir, 'info.log'), 'utf8')).not.toContain('boom')

    expect(console.log).toHaveBeenCalledWith('http level=info response=200')
    expect(console.error).toHaveBeenCalledWith('boom level=error reason=kaboom')
  })

  it('appends rather than truncating across calls', async () => {
    const logger = createConsoleFileLogger(dir)
    logger.info('one')
    logger.info('two')
    await logger.close()
    expect(await readFile(join(dir, 'info.log'), 'utf8')).toBe('one level=info\ntwo level=info\n')
  })
})
