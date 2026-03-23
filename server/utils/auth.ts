import { getCookie, setCookie, deleteCookie, createError } from 'h3'
import type { H3Event } from 'h3'
import { verifyAccessToken } from './jwt'

export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

const isSecure = () => (process.env.NODE_ENV ?? 'development') === 'production'

export const getAccessTokenFromCookie = (event: H3Event) => getCookie(event, 'aic_access') ?? null

export const getRefreshTokenFromRequest = (event: H3Event) => getCookie(event, 'aic_refresh') ?? null

export const setAccessCookie = (event: H3Event, accessToken: string, accessTTL: number) => {
  setCookie(event, 'aic_access', accessToken, {
    httpOnly: true, sameSite: 'lax', secure: isSecure(), path: '/', maxAge: accessTTL
  })
}

export const setRefreshCookie = (event: H3Event, refreshToken: string, refreshTTL: number) => {
  setCookie(event, 'aic_refresh', refreshToken, {
    httpOnly: true, sameSite: 'lax', secure: isSecure(), path: '/', maxAge: refreshTTL
  })
}

export const clearAuthCookies = (event: H3Event) => {
  deleteCookie(event, 'aic_access', { path: '/' })
  deleteCookie(event, 'aic_refresh', { path: '/' })
}

export const getAuthUser = async (event: H3Event): Promise<AuthUser | null> => {
  if (event.context.user) return event.context.user as AuthUser
  const token = getAccessTokenFromCookie(event)
  if (!token) return null
  try {
    const payload = await verifyAccessToken(token)
    return {
      id: payload.sub as string,
      email: (payload.email as string | undefined) ?? null,
      name: (payload.name as string | undefined) ?? null,
      picture: (payload.picture as string | undefined) ?? null
    }
  }
  catch {
    return null
  }
}

export const requireAuthUser = async (event: H3Event) => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
