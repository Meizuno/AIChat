import type { PromptGroup } from '#shared/types/prompt'

// App-level presentation constants. Previously these lived in config.yml /
// the /api/config payload; now that ai-chat is fully DB- + constant-driven,
// they live here.

// Assistant display name + welcome-screen greeting (brand strings).
export const BOT_NAME = 'Meizuno AI'
export const WELCOME_MESSAGE = 'Hello! How can I help you today?'

// Starter prompt chips shown on the empty welcome screen and in the prompt
// picker. Grouped the same way the picker renders sections. Add `route`
// entries (fetched via /api/prompts/*) once the matching MCP server is
// registered by the user.
export const SUGGESTED_PROMPTS: PromptGroup[] = [
  {
    server: 'Suggestions',
    prompts: [
      { label: 'What can you do?', prompt: 'What can you help me with?' },
      { label: 'Summarize', prompt: 'Give me a concise summary of ' },
      { label: 'Draft an email', prompt: 'Help me draft an email about ' }
    ]
  }
]

// Optional token pricing for the cost readout. Leave undefined to fall back to
// useUsage's built-in price band; set to enable an exact per-model estimate.
export const PRICING: { inputPerMillion: number, outputPerMillion: number } | undefined = undefined
