import type { AppConfigResponse } from '#shared/types/config'

// Shape the public /api/config response from the raw mcp-config.yml.
// The wire shape is deliberately narrow — server-internal fields
// (mcpServers URLs, systemPrompt, …) are not exposed.
export function getAppConfigResponse(): AppConfigResponse {
  const { defaults, mcpServers, pricing } = getConfig()
  const promptGroups = (mcpServers ?? [])
    .filter(s => s.suggestedPrompts?.length)
    .map(s => ({ server: s.name, prompts: s.suggestedPrompts! }))
  return { defaults, promptGroups, pricing }
}
