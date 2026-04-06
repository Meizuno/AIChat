import { getCookie } from 'h3'
import { tryRefresh } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/')) return

  const token = getCookie(event, 'aic_access') ?? ''
  const user = await verifyAccessToken(token)

  if (user) {
    event.context.user = user
    event.context.accessToken = token
    return
  }

  await tryRefresh(event)
})
