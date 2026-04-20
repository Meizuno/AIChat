import { getConfig } from '../utils/mcp-config'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const { defaults, mcpServers, pricing } = getConfig()
  const promptGroups = (mcpServers ?? [])
    .filter(s => s.suggestedPrompts?.length)
    .map(s => ({ server: s.name, prompts: s.suggestedPrompts! }))
  return { defaults, promptGroups, pricing }
})
