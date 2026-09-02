import { describe, expect, it, vi } from 'vitest'
import type { SandboxRunner } from '../../../server/utils/sandbox'
import { buildSystemTools } from '../../../server/services/system-tools'

// A tool's execute has extra runtime args (toolCallId, messages); the tests
// only pass input, so call through a loose signature.
type ExecutableTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }

describe('buildSystemTools', () => {
  it('offers no tools when there is no sandbox', () => {
    expect(Object.keys(buildSystemTools(null))).toEqual([])
  })

  it('offers run_code when a sandbox is configured', () => {
    const sandbox: SandboxRunner = { run: vi.fn() }
    const tools = buildSystemTools(sandbox)
    expect(Object.keys(tools)).toEqual(['run_code'])
    // Plain key (no `slug__`), so it never collides with MCP tools.
    expect('run_code').not.toContain('__')
  })

  it('run_code returns stdout on success', async () => {
    const sandbox: SandboxRunner = { run: vi.fn().mockResolvedValue({ ok: true, stdout: '42\n', stderr: '' }) }
    const tool = buildSystemTools(sandbox).run_code as unknown as ExecutableTool
    const out = await tool.execute({ language: 'python', source: 'print(42)' }, {})
    expect(sandbox.run).toHaveBeenCalledWith({ language: 'python', source: 'print(42)' })
    expect(out).toBe('42\n')
  })

  it('run_code surfaces stderr as readable text on failure', async () => {
    const sandbox: SandboxRunner = { run: vi.fn().mockResolvedValue({ ok: false, stdout: '', stderr: 'NameError: x' }) }
    const tool = buildSystemTools(sandbox).run_code as unknown as ExecutableTool
    const out = await tool.execute({ language: 'python', source: 'print(x)' }, {})
    expect(out).toContain('Execution failed')
    expect(out).toContain('NameError: x')
  })
})
