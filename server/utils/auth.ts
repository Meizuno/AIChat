import { getCookie, getHeader, setCookie, deleteCookie, createError } from 'h3'
import type { H3Event } from 'h3'

export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

const isSecure = () => process.env.NODE_ENV === 'production'

/** Validate a token string against the auth service */
async function validateToken(token: string): Promise<string | null> {
  if (!token) return null
  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ user_id: string }>(`${config.authServiceUrl}/validate`, {
      headers: { authorization: `Bearer ${token}` }
    })
    return result.user_id ?? null
  }
  catch {
    return null
  }
}

/** Read cookie from H3 event or raw header (SSR internal fetch) */
function readCookie(event: H3Event, name: string): string | null {
  const fromH3 = getCookie(event, name)
  if (fromH3) return fromH3
  const raw = getHeader(event, 'cookie') ?? ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1] ?? null
}

// Stores refreshed token per SSR render so internal API calls can use it
let ssrRefreshedToken: string | null = null

/**
 * Authenticate the request. Checks access token first, then tries refresh.
 * Sets event.context.user and event.context.accessToken on success.
 */
export async function authenticate(event: H3Event): Promise<AuthUser | null> {
  if (event.context.user) return event.context.user as AuthUser

  const header = getHeader(event, 'authorization')
  const accessToken = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : (readCookie(event, 'aic_access') ?? ssrRefreshedToken ?? '')

  const userId = await validateToken(accessToken)
  if (userId) {
    const user: AuthUser = { id: userId }
    event.context.user = user
    event.context.accessToken = accessToken
    return user
  }

  const refreshToken = readCookie(event, 'aic_refresh')
  if (!refreshToken) return null

  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ access_token: string, refresh_token: string }>(
      `${config.authServiceUrl}/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } }
    )

    setAuthCookies(event, result.access_token, result.refresh_token)
    ssrRefreshedToken = result.access_token
    setTimeout(() => { ssrRefreshedToken = null }, 5_000)

    const newUserId = await validateToken(result.access_token)
    if (!newUserId) return null

    const user: AuthUser = { id: newUserId }
    event.context.user = user
    event.context.accessToken = result.access_token
    return user
  }
  catch {
    return null
  }
}

/** Require authenticated user or throw 401 */
export function requireAuthUser(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | undefined
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

export function setAuthCookies(event: H3Event, accessToken: string, refreshToken: string) {
  const secure = isSecure()
  setCookie(event, 'aic_access', accessToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/'
  })
  setCookie(event, 'aic_refresh', refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 7
  })
}

export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, 'aic_access', { path: '/' })
  deleteCookie(event, 'aic_refresh', { path: '/' })
}
