import { updateSettingsSchema } from '#shared/schemas/settings'

// Update the signed-in user's settings (currently just the profile URL).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const patch = await readValidatedBody(event, updateSettingsSchema.parse)
  const settings = await saveUserSettings(userId, patch)
  return { profileUrl: settings.profileUrl ?? '' }
})
