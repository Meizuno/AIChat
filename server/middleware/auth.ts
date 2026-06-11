// Pre-route auth pass. For each /api/* request (except the explicitly
// excluded auth/health surfaces) we populate event.context.user when a
// valid session is present; downstream handlers/services call
// requireAuthUser() to gate, or viewerId() to scope reads.
//
// On a stale access token we attempt one refresh against the auth
// service and rewrite the cookies on success. A failed refresh leaves
// the request anonymous — downstream requireAuthUser throws the actual
// 401. (Clearing cookies on refresh failure would log the user out of
// every tab on a transient auth-service blip.)

const SKIP_PATHS = [
  '/api/auth/google',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/_nuxt_icon/',
  '/api/health'
]

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''
  if (!path.startsWith('/api/')) return
  if (SKIP_PATHS.some(p => path.startsWith(p))) return

  const ok = await authenticate(event)
  if (ok) return

  // No valid access token — try the refresh cookie once. Silent on
  // failure; downstream requireAuthUser is the actual 401 gate.
  await tryRefresh(event)
})
