import { createError, getCookie } from 'h3'
import { getPrisma } from '../../utils/db'
import { signAccessToken, getAccessTokenTTL, getRefreshTokenTTL } from '../../utils/jwt'
import { clearAuthCookies, setAuthCookies } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'aic_refresh')
  if (!refreshToken) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'Missing refresh token.' })
  }

  const prisma = getPrisma()
  const refresh = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })

  if (!refresh) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token.' })
  }

  if (new Date(refresh.expires_at).getTime() <= Date.now()) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'Refresh token expired.' })
  }

  const user = await prisma.user.findUnique({
    where: { id: refresh.user_id },
    select: { id: true, email: true, name: true, picture: true }
  })

  if (!user) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, statusMessage: 'User not found.' })
  }

  const accessTTL = getAccessTokenTTL()
  const refreshTTL = getRefreshTokenTTL()
  const accessToken = await signAccessToken(user, accessTTL)
  const newRefreshToken = crypto.randomUUID()

  await prisma.refreshToken.update({
    where: { id: refresh.id },
    data: {
      token: newRefreshToken,
      expires_at: new Date(Date.now() + refreshTTL * 1000)
    }
  })

  setAuthCookies(event, accessToken, newRefreshToken, accessTTL, refreshTTL)
  return { accessToken, user }
})
