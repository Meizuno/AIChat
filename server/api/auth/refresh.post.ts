// The auth middleware already runs `authenticate` and (on failure)
// `tryRefresh` for every /api/* request. By the time we get here the
// session is either valid or it isn't — requireAuthUser surfaces the
// 401 either way. The endpoint exists so clients can poll for "is my
// session still good?" without inspecting cookies directly.
export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  return { ok: true }
})
