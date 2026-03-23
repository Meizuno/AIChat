import { getAccessTokenFromCookie, getRefreshTokenFromRequest, setAccessCookie, setRefreshCookie, clearAuthCookies } from '../utils/auth'
import { verifyAccessToken, signAccessToken, getAccessTokenTTL, getRefreshTokenTTL } from '../utils/jwt'
import { rotateRefreshSession } from '../utils/refresh-memory'

export default defineEventHandler(async (event) => {
  // Only run for API routes that need auth context
  const path = event.path ?? ''
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/google')) return

  const accessToken = getAccessTokenFromCookie(event)

  if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken)
      event.context.user = {
        id: payload.sub as string,
        email: (payload.email as string | undefined) ?? null,
        name: (payload.name as string | undefined) ?? null,
        picture: (payload.picture as string | undefined) ?? null
      }
      return
    }
    catch {
      // Access token expired or invalid — try refresh below
    }
  }

  const refreshToken = getRefreshTokenFromRequest(event)
  if (!refreshToken) return

  const refreshTTL = getRefreshTokenTTL()
  const rotated = rotateRefreshSession(refreshToken, refreshTTL)
  if (!rotated) {
    clearAuthCookies(event)
    return
  }

  const accessTTL = getAccessTokenTTL()
  const newAccessToken = await signAccessToken(rotated.user, accessTTL)
  setAccessCookie(event, newAccessToken, accessTTL)
  setRefreshCookie(event, rotated.token, refreshTTL)

  event.context.user = rotated.user
})
