import type { Prisma } from '@prisma/client'
import type { UpdateSettingsInput } from '#shared/schemas/settings'

// Scoped data-access for per-user settings (one row per user, keyed by user_id).
// Pure Prisma — mirrors chats.ts / mcp-servers.ts.

/** The user's settings row, or null if they've never saved any. */
export function getUserSettings(userId: string) {
  return getPrisma().setting.findUnique({ where: { user_id: userId } })
}

/** Upsert the user's settings. Only fields present in `patch` are changed;
 *  an empty-string profileUrl clears it (stored as null). */
export function saveUserSettings(userId: string, patch: UpdateSettingsInput) {
  const data: { profileUrl?: string | null, suggestedPrompts?: Prisma.InputJsonValue } = {}
  if (patch.profileUrl !== undefined) {
    data.profileUrl = patch.profileUrl === '' ? null : patch.profileUrl
  }
  if (patch.suggestedPrompts !== undefined) {
    data.suggestedPrompts = patch.suggestedPrompts
  }
  return getPrisma().setting.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...data },
    update: data
  })
}
