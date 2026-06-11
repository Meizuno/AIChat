import type { PromptGroup } from './prompt'

// The shape /api/config returns to the client. Mirrors the fields
// `chat.vue` actually consumes — defaults for the welcome screen, the
// flattened prompt groups, and the optional pricing used to render
// the token-cost estimate. Internal mcpServers config is server-only
// and deliberately not in the wire shape.
export type AppConfigResponse = {
  defaults: {
    currency: string
    transactionType: string
    language: string
    botName: string
    welcomeMessage: string
  }
  promptGroups: PromptGroup[]
  pricing?: {
    inputPerMillion: number
    outputPerMillion: number
  }
}
