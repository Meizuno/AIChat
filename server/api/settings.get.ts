import type { SuggestedPrompt } from '#shared/schemas/settings'

// Read the signed-in user's settings (empty defaults if unset).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const settings = await getUserSettings(userId)
  return {
    profileUrl: settings?.profileUrl ?? '',
    suggestedPrompts: (settings?.suggestedPrompts as SuggestedPrompt[] | null) ?? []
  }
})
