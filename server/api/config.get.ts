export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  return getAppConfigResponse()
})
