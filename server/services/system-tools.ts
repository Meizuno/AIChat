import { tool } from 'ai'
import { z } from 'zod'
import type { ToolSet } from 'ai'

// App-owned "system" tools: built-in capabilities every chat gets, distinct
// from the per-user MCP servers (server/services/mcp.ts). They are merged into
// the chat ToolSet alongside the MCP tools, but they are NOT part of the
// McpServer registry and NOT surfaced by probeMcpServers — so they never appear
// in the MCP status UI. A system tool is a platform capability the app owns and
// controls, not something a user registers.
//
// Naming: system tools use plain keys (e.g. `run_code`). MCP tools are always
// namespaced `slug__tool`, so the two can never collide.

// Build the run_code tool over a sandbox runner. The model calls it; execution
// happens in the separate, isolated sandbox component (see server/utils/sandbox).
function buildRunCodeTool(sandbox: SandboxRunner) {
  return tool({
    description:
      'Run code in an isolated sandbox and get its stdout/stderr back. Use it '
      + 'for calculations, data processing, or anything better computed than '
      + 'guessed. No network or persistent filesystem; keep each run self-contained.',
    inputSchema: z.object({
      // The sandbox only runs Python today; keep the enum in step with it so the
      // model can't call an unsupported language and get a hard error back.
      language: z.enum(['python']).describe('Language to execute the code in (only python is supported)'),
      source: z.string().min(1).max(100_000, 'source too large').describe('The complete program to run')
    }),
    execute: async ({ language, source }) => {
      const result = await sandbox.run({ language, source })
      if (result.ok) return result.stdout || '(no output)'
      // Surface the failure as text so the model can read the error and retry.
      return `Execution failed:\n${result.stderr || result.stdout || '(no error output)'}`
    }
  })
}

/** Assemble the system tools for a given sandbox runner (null → none). Pure; testable. */
export function buildSystemTools(sandbox: SandboxRunner | null): ToolSet {
  const tools: ToolSet = {}
  if (sandbox) tools.run_code = buildRunCodeTool(sandbox)
  return tools
}

/** The app's built-in tools, wired to the configured backends. */
export function getSystemTools(): ToolSet {
  return buildSystemTools(getSandboxRunner())
}
