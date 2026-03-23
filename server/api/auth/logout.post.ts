import { clearAuthCookies, getRefreshTokenFromRequest } from '../../utils/auth'
import { revokeRefreshSession } from '../../utils/refresh-memory'

export default defineEventHandler(async (event) => {
  const refreshToken = getRefreshTokenFromRequest(event)
  if (refreshToken) revokeRefreshSession(refreshToken)
  clearAuthCookies(event)
  return { ok: true }
})
