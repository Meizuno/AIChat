import { getCookie, setCookie, deleteCookie, createError } from 'h3'
import type { H3Event } from 'h3'

export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

const isSecure = () => process.env.NODE_ENV === 'production'

export const verifyAccessToken = async (token: string): Promise<AuthUser | null> => {
  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ user_id: string }>(`${config.authServiceUrl}/validate`, {
      headers: { authorization: `Bearer ${token}` }
    })
    if (!result.user_id) return null
    return { id: result.user_id }
  }
  catch {
    return null
  }
}

const tryRefresh = async (event: H3Event): Promise<AuthUser | null> => {
  const refreshToken = getCookie(event, 'aic_refresh')
  if (!refreshToken) return null
  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ access_token: string, refresh_token: string }>(
      `${config.authServiceUrl}/refresh`,
      { method: 'POST', headers: { authorization: `Bearer ${refreshToken}` } }
    )
    setAuthCookies(event, result.access_token, result.refresh_token)
    const user = await verifyAccessToken(result.access_token)
    if (user) {
      event.context.user = user
      event.context.accessToken = result.access_token
    }
    return user
  }
  catch {
    return null
  }
}

export const getAuthUser = async (event: H3Event): Promise<AuthUser | null> => {
  if (event.context.user) return event.context.user as AuthUser
  const token = getCookie(event, 'aic_access') ?? null
  if (token) {
    const user = await verifyAccessToken(token)
    if (user) {
      event.context.user = user
      event.context.accessToken = token
      return user
    }
  }
  return tryRefresh(event)
}

export const requireAuthUser = async (event: H3Event): Promise<AuthUser> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

export const setAuthCookies = (event: H3Event, accessToken: string, refreshToken: string) => {
  const secure = isSecure()
  setCookie(event, 'aic_access', accessToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/'
  })
  setCookie(event, 'aic_refresh', refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 7
  })
}

export const clearAuthCookies = (event: H3Event) => {
  deleteCookie(event, 'aic_access', { path: '/' })
  deleteCookie(event, 'aic_refresh', { path: '/' })
}
