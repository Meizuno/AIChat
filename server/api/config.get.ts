import { getConfig } from '../utils/mcp-config'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const { defaults, suggestedPrompts } = getConfig()
  return { defaults, suggestedPrompts: suggestedPrompts ?? [] }
})
