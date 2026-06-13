import { describe, it, expect, vi } from 'vitest'
import {
  slugifyServerName,
  buildServerSlugs,
  namespaceToolName,
  forwardInputSchema,
  flattenContentBlocks,
  flattenToolResult
} from '../../../server/utils/mcp-tools'

describe('slugifyServerName', () => {
  it('replaces disallowed characters with underscores', () => {
    expect(slugifyServerName('Money Manager')).toBe('Money_Manager')
  })

  it('collapses runs of disallowed chars and trims edges', () => {
    expect(slugifyServerName('  Recipes!! Book  ')).toBe('Recipes_Book')
  })

  it('keeps already-valid slugs untouched', () => {
    expect(slugifyServerName('Notes')).toBe('Notes')
    expect(slugifyServerName('a-b_c')).toBe('a-b_c')
  })

  it('falls back to "server" when nothing survives', () => {
    expect(slugifyServerName('!!!')).toBe('server')
  })
})

describe('buildServerSlugs', () => {
  it('preserves order and leaves distinct names alone', () => {
    expect(buildServerSlugs(['Money Manager', 'Recipes Book', 'Notes']))
      .toEqual(['Money_Manager', 'Recipes_Book', 'Notes'])
  })

  it('de-duplicates names that sanitize to the same slug', () => {
    // "A!" and "A@" both sanitize to "A".
    expect(buildServerSlugs(['A!', 'A@', 'A#'])).toEqual(['A', 'A_2', 'A_3'])
  })
})

describe('namespaceToolName', () => {
  it('joins slug and tool name with a double underscore', () => {
    expect(namespaceToolName('Notes', 'search')).toBe('Notes__search')
  })

  it('clamps to the 64-char provider limit', () => {
    const slug = 'srv'
    const longTool = 'x'.repeat(100)
    const name = namespaceToolName(slug, longTool)
    expect(name.length).toBe(64)
    expect(name.startsWith('srv__')).toBe(true)
  })
})

describe('forwardInputSchema', () => {
  it('forwards the schema faithfully, keeping meta and refs', () => {
    const raw = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      $defs: { Id: { type: 'string' } },
      properties: { id: { $ref: '#/$defs/Id' } },
      required: ['id']
    }
    // Same reference back — nothing stripped or rebuilt.
    expect(forwardInputSchema(raw)).toBe(raw)
  })

  it('substitutes a minimal object schema when none is declared', () => {
    expect(forwardInputSchema(undefined)).toEqual({ type: 'object', properties: {} })
    expect(forwardInputSchema({ type: 'string' })).toEqual({ type: 'object', properties: {} })
  })
})

describe('flattenContentBlocks', () => {
  it('joins text blocks with newlines', () => {
    const content = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' }
    ]
    expect(flattenContentBlocks(content)).toBe('first\nsecond')
  })

  it('represents non-text blocks with a short placeholder', () => {
    const content = [
      { type: 'text', text: 'caption' },
      { type: 'image', data: 'base64...', mimeType: 'image/png' },
      { type: 'resource', resource: { uri: 'file://x' } }
    ]
    expect(flattenContentBlocks(content)).toBe('caption\n[image]\n[resource]')
  })

  it('tolerates non-array content', () => {
    expect(flattenContentBlocks(undefined)).toBe('')
  })
})

describe('flattenToolResult', () => {
  it('returns joined text for a successful result', () => {
    const result = { content: [{ type: 'text', text: 'ok' }] }
    expect(flattenToolResult(result)).toBe('ok')
  })

  it('throws carrying the text content when isError is set', () => {
    const result = { isError: true, content: [{ type: 'text', text: 'boom: bad arguments' }] }
    expect(() => flattenToolResult(result)).toThrow('boom: bad arguments')
  })

  it('throws a generic message when an error has no text', () => {
    expect(() => flattenToolResult({ isError: true, content: [] })).toThrow('MCP tool call failed')
  })
})

// Mirrors how getChatTools keys its ToolSet: each tool is registered under
// its namespaced name, while its execute closure captures the original tool
// name and that server's own client. Proves two servers exposing "search"
// neither collide nor cross-route.
describe('namespaced tool routing (collision fix)', () => {
  it('two servers exposing "search" both survive and route to the correct client', async () => {
    const clientA = { callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'from A' }] })) }
    const clientB = { callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'from B' }] })) }

    const servers = [
      { slug: buildServerSlugs(['Money Manager', 'Notes'])[0]!, client: clientA, toolName: 'search' },
      { slug: buildServerSlugs(['Money Manager', 'Notes'])[1]!, client: clientB, toolName: 'search' }
    ]

    const toolset: Record<string, { execute: (args: Record<string, unknown>) => Promise<string> }> = {}
    for (const s of servers) {
      toolset[namespaceToolName(s.slug, s.toolName)] = {
        execute: async args => flattenToolResult(await s.client.callTool({ name: s.toolName, arguments: args }))
      }
    }

    const keys = Object.keys(toolset)
    expect(keys).toEqual(['Money_Manager__search', 'Notes__search'])

    expect(await toolset['Money_Manager__search']!.execute({})).toBe('from A')
    expect(await toolset['Notes__search']!.execute({})).toBe('from B')
    expect(clientA.callTool).toHaveBeenCalledWith({ name: 'search', arguments: {} })
    expect(clientB.callTool).toHaveBeenCalledWith({ name: 'search', arguments: {} })
  })
})
