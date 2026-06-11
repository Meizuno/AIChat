import { getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

export type AuthUser = { id: string }

// Secure cookies everywhere except the dev server (http localhost).
// import.meta.dev is the Nuxt-native signal — avoids reading process.env
// outside the env plugin (per architecture rule).
const isSecure = () => !import.meta.dev

// SSR-internal-fetch dedup. The outer request refreshes once and
// rotates the refresh token; the inner $fetch fired by `useFetch` in
// the same render still carries the OLD refresh cookie via headers.
// Without this cache the inner call would re-POST /refresh with an
// already-rotated token and the auth service would 401. 5-second TTL
// is plenty — the inner fetches all happen within one render.
//
// Map<old refresh token, new access token>
const refreshedTokens = new Map<string, string>()

/** Validate a token against the external auth service. */
export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  if (!token) return null
  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ user_id: string }>(
      `${config.authServiceUrl}/validate`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    return result.user_id ? { id: result.user_id } : null
  } catch {
    return null
  }
}

/** Read cookie from H3 event or raw header (covers SSR internal fetch). */
function readCookie(event: H3Event, name: string): string {
  const fromH3 = getCookie(event, name)
  if (fromH3) return fromH3
  const raw = getHeader(event, 'cookie') ?? ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1] ?? ''
}

/** Read the access token from Authorization header, access cookie, or refresh-dedup cache. */
function readAccessToken(event: H3Event): string {
  const header = getHeader(event, 'authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  const direct = readCookie(event, 'aic_access')
  if (direct) return direct
  // Inner SSR fetch may only carry the (now rotated) refresh cookie.
  const refresh = readCookie(event, 'aic_refresh')
  return refresh ? (refreshedTokens.get(refresh) ?? '') : ''
}

/**
 * Attempt to authenticate the current request. Sets event.context.user
 * (+ accessToken) on success and returns the user, or null when no
 * valid credentials are present. Idempotent — safe to call repeatedly;
 * a prior middleware run short-circuits via the cached context.
 *
 * Does NOT attempt refresh — see {@link tryRefresh}. The split lets
 * pure validators (e.g. /api/auth/me, the MCP handler) call this
 * without triggering a refresh round-trip.
 */
export async function authenticate(event: H3Event): Promise<AuthUser | null> {
  if (event.context.user) return event.context.user
  const token = readAccessToken(event)
  const user = await verifyAccessToken(token)
  if (!user) return null
  event.context.user = user
  event.context.accessToken = token
  return user
}

/**
 * Exchange the refresh cookie for a fresh access/refresh pair against
 * the auth service. On success: rewrites the cookies, populates the
 * dedup cache, and sets event.context.user. On failure: leaves the
 * request anonymous (the caller decides whether to throw 401).
 */
export async function tryRefresh(event: H3Event): Promise<AuthUser | null> {
  const refreshToken = readCookie(event, 'aic_refresh')
  if (!refreshToken) return null

  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ access_token: string, refresh_token: string }>(
      `${config.authServiceUrl}/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } }
    )
    setAuthCookies(event, result.access_token, result.refresh_token)
    refreshedTokens.set(refreshToken, result.access_token)
    setTimeout(() => refreshedTokens.delete(refreshToken), 5_000)

    const user = await verifyAccessToken(result.access_token)
    if (!user) return null
    event.context.user = user
    event.context.accessToken = result.access_token
    return user
  } catch {
    return null
  }
}

/** Same shape as authenticate, but throws Unauthorized when no session is present. */
export async function requireAuthUser(event: H3Event): Promise<AuthUser> {
  const user = event.context.user ?? await authenticate(event)
  if (!user) throw new Unauthorized()
  return user
}

/**
 * The viewer's user id for scoping, or null for anonymous. Bridges the
 * HTTP transport (event.context.user) to a viewer-id shape suited to
 * any transport — matches the notes/money-manager pattern.
 */
export function viewerId(event: H3Event): string | null {
  return event.context.user?.id ?? null
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
  setCookie(event, 'aic_access', '', { path: '/', maxAge: 0 })
  setCookie(event, 'aic_refresh', '', { path: '/', maxAge: 0 })
}
