import { createError } from 'h3'
import { getAccessTokenTTL, getRefreshTokenTTL, signAccessToken } from '../../utils/jwt'
import { clearAuthCookies, getRefreshTokenFromRequest, setAccessCookie, setRefreshCookie } from '../../utils/auth'
import { rotateRefreshSession } from '../../utils/refresh-memory'

export default defineEventHandler(async (event) => {
  const currentRefreshToken = getRefreshTokenFromRequest(event)
  if (!currentRefreshToken) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'Missing refresh token.' })
  }

  const refreshTTL = getRefreshTokenTTL()
  const rotated = rotateRefreshSession(currentRefreshToken, refreshTTL)

  if (!rotated) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired refresh token.' })
  }

  const accessTTL = getAccessTokenTTL()
  const accessToken = await signAccessToken(rotated.user, accessTTL)
  setAccessCookie(event, accessToken, accessTTL)
  setRefreshCookie(event, rotated.token, refreshTTL)
  return { user: rotated.user }
})
