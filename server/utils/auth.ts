import { getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

export type AuthUser = { id: string }

// The auth service issues these cookies on COOKIE_DOMAIN (e.g. .meizuno.com),
// so one sign-in is valid across every *.meizuno.com app. We read the SAME
// names it sets, and only re-set them (with the same attributes) when we
// rotate the pair on refresh. access_token is readable (SPAs may Bearer it),
// refresh_token is httpOnly — mirroring the auth service exactly.
const ACCESS_COOKIE = 'access_token'
const REFRESH_COOKIE = 'refresh_token'
const ACCESS_MAX_AGE = 60 * 15
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7

// Secure cookies everywhere except the dev server (http localhost).
// import.meta.dev is the Nuxt-native signal — avoids reading process.env
// outside the env plugin (per architecture rule).
const isSecure = () => !import.meta.dev

// Parent domain the cookies are scoped to (NUXT_COOKIE_DOMAIN, e.g.
// `.meizuno.com`). Empty in dev → host-only cookies on localhost.
function cookieDomain(): string | undefined {
  return (useRuntimeConfig().cookieDomain as string) || undefined
}

// SSR-internal-fetch dedup. The outer request refreshes once and
// rotates the refresh token; the inner $fetch fired by `useFetch` in
// the same render still carries the OLD refresh cookie via headers.
// Without this cache the inner call would re-POST /refresh with an
// already-rotated token and the auth service would 401. 5-second TTL
// is plenty — the inner fetches all happen within one render.
//
// Map<old refresh token, new access token>
const refreshedTokens = new Map<string, string>()

// Single-flight refresh. Refresh tokens are SINGLE-USE — the auth service
// rotates them and treats a second use of the same token as reuse, revoking
// the whole family (a surprise logout). Parallel client XHRs (e.g. the MCP
// status poll + a chat send) that all hit an expired access token would each
// POST /refresh with the same cookie. Coalescing them onto ONE in-flight
// /refresh call keeps rotation single-use. Map<old refresh token, in-flight>.
type RefreshResult = { access: string, refresh: string } | null
const inflightRefresh = new Map<string, Promise<RefreshResult>>()

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

// The auth service rotates the refresh token into its /refresh Set-Cookie
// response (never the body, by design). Read the rotated value from there so
// the server-side refresh can re-issue it to the browser.
function rotatedRefresh(headers: Headers): string {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const cookies = typeof getter === 'function' ? getter.call(headers) : []
  for (const c of cookies) {
    const m = c.match(new RegExp(`^\\s*${REFRESH_COOKIE}=([^;]*)`))
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return ''
}

/** Read the access token from Authorization header, access cookie, or refresh-dedup cache. */
function readAccessToken(event: H3Event): string {
  const header = getHeader(event, 'authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  const direct = readCookie(event, ACCESS_COOKIE)
  if (direct) return direct
  // Inner SSR fetch may only carry the (now rotated) refresh cookie.
  const refresh = readCookie(event, REFRESH_COOKIE)
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
// POST /refresh exactly once per refresh token, shared by all concurrent
// callers via inflightRefresh. Returns the new pair (rotated refresh read
// from Set-Cookie, never the body) or null.
async function doRefresh(authServiceUrl: string, refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await $fetch.raw<{ access_token: string }>(
      `${authServiceUrl}/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } }
    )
    const access = res._data?.access_token ?? ''
    const refresh = rotatedRefresh(res.headers)
    return access && refresh ? { access, refresh } : null
  } catch {
    return null
  }
}

export async function tryRefresh(event: H3Event): Promise<AuthUser | null> {
  const refreshToken = readCookie(event, REFRESH_COOKIE)
  if (!refreshToken) return null

  // A sibling request may have just rotated this token — reuse its result
  // instead of POSTing /refresh again (which would be flagged as reuse).
  const cached = refreshedTokens.get(refreshToken)
  if (cached) {
    const user = await verifyAccessToken(cached)
    if (user) {
      event.context.user = user
      event.context.accessToken = cached
      return user
    }
  }

  const { authServiceUrl } = useRuntimeConfig()
  let inflight = inflightRefresh.get(refreshToken)
  if (!inflight) {
    inflight = doRefresh(authServiceUrl, refreshToken)
    inflightRefresh.set(refreshToken, inflight)
    void inflight.finally(() => inflightRefresh.delete(refreshToken))
  }

  const result = await inflight
  if (!result) return null

  // Each concurrent caller re-issues the (identical) rotated pair to its own
  // response and records it for the SSR-internal-fetch dedup cache.
  setAuthCookies(event, result.access, result.refresh)
  refreshedTokens.set(refreshToken, result.access)
  setTimeout(() => refreshedTokens.delete(refreshToken), 5_000)

  const user = await verifyAccessToken(result.access)
  if (!user) return null
  event.context.user = user
  event.context.accessToken = result.access
  return user
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

// Re-set the shared cookies after a rotation. Attributes mirror the auth
// service so whichever side last writes them, the cookie stays identical.
export function setAuthCookies(event: H3Event, accessToken: string, refreshToken: string) {
  const secure = isSecure()
  const domain = cookieDomain()
  setCookie(event, ACCESS_COOKIE, accessToken, {
    httpOnly: false, sameSite: 'lax', secure, path: '/', domain, maxAge: ACCESS_MAX_AGE
  })
  setCookie(event, REFRESH_COOKIE, refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', domain, maxAge: REFRESH_MAX_AGE
  })
}

export function clearAuthCookies(event: H3Event) {
  const domain = cookieDomain()
  setCookie(event, ACCESS_COOKIE, '', { path: '/', domain, maxAge: 0 })
  setCookie(event, REFRESH_COOKIE, '', { path: '/', domain, maxAge: 0 })
}
