export default defineEventHandler(async (event) => {
  const user = await authenticate(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return { ok: true }
})
