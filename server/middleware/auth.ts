const SKIP_PATHS = [
  '/api/auth/google',
  '/api/auth/callback',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/_nuxt_icon/',
  '/api/health'
]

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''
  if (SKIP_PATHS.some(p => path.startsWith(p))) return

  if (path.startsWith('/api/') || !path.includes('.')) {
    await authenticate(event)
  }
})
