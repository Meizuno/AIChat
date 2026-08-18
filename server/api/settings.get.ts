// Read the signed-in user's settings (empty defaults if unset).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const settings = await getUserSettings(userId)
  return { profileUrl: settings?.profileUrl ?? '' }
})
