import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { z } from 'zod'

// Runtime config (config.yml, mounted read-only at /app/config.yml). Validated
// with zod and loaded ONCE — a missing / malformed / mis-shaped file throws
// rather than silently falling back to defaults, so it fails fast at startup
// (see server/plugins/validate-config.ts). Infer the types from the schema.

const suggestedPromptSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1).optional(),
  route: z.string().min(1).optional()
})

const mcpServerSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  suggestedPrompts: z.array(suggestedPromptSchema).optional()
})

const appConfigSchema = z.object({
  mcpServers: z.array(mcpServerSchema).default([]),
  model: z.string().min(1, 'model is required'),
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  defaults: z
    .object({
      currency: z.string().default('CZK'),
      transactionType: z.string().default('expense'),
      language: z.string().default('en'),
      botName: z.string().default(''),
      welcomeMessage: z.string().default('')
    })
    .default({ currency: 'CZK', transactionType: 'expense', language: 'en', botName: '', welcomeMessage: '' }),
  pricing: z
    .object({
      inputPerMillion: z.number(),
      outputPerMillion: z.number()
    })
    .optional()
})

export type SuggestedPrompt = z.infer<typeof suggestedPromptSchema>
export type McpServerConfig = z.infer<typeof mcpServerSchema>
export type AppConfig = z.infer<typeof appConfigSchema>

let cached: AppConfig | undefined

// Reads + validates config.yml once, then caches. Throws on any problem
// (missing file, invalid YAML, or schema mismatch) — no silent fallback.
export function getConfig(): AppConfig {
  if (cached) return cached
  const filePath = resolve(process.cwd(), 'config.yml')

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    throw new Error(`config.yml not found or unreadable at ${filePath}`)
  }

  let parsed: unknown
  try {
    parsed = load(raw)
  } catch (err) {
    throw new Error(`config.yml is not valid YAML: ${(err as Error).message}`)
  }

  const result = appConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`config.yml failed validation:\n${issues}`)
  }

  cached = result.data
  return cached
}

export function getMcpServers(): McpServerConfig[] {
  return getConfig().mcpServers
}
