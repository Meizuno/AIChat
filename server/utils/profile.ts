import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Per-user "who am I working for" context. Each user can point the assistant at
// a public profile document (an llms.txt-style page) via their settings; it's
// fetched and (fenced as untrusted, see server/services/chat) prepended to their
// system prompt. Purely per-user — no built-in default; unset means no profile.
//
// SSRF hardening: the app runs inside a Docker network alongside the auth, notes
// and money-manager services, and the fetched body is readable back out of the
// model — so this is SSRF WITH exfiltration. Defences: https-only (also enforced
// at the settings boundary), the resolved host must not be loopback/link-local/
// private, and redirects are not followed (a permitted host can't bounce to an
// internal one). Any rejection degrades to an empty profile — never throws into
// the stream path.
//
// Only text/plain or text/markdown responses count, and the stored text is
// capped at 16 KB (truncated on a line boundary). Documents are cached by URL
// for TTL_MS (bounded to 100 entries); a failed/blocked fetch caches empty
// (negative caching) so a flapping or hostile host can't slow every message.

const TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const MAX_PROFILE_BYTES = 16 * 1024
const MAX_CACHE_ENTRIES = 100
const cache = new Map<string, { text: string, at: number }>()

/** The profile URL a user configured in their settings (empty when unset). */
export async function getUserProfileUrl(userId: string): Promise<string> {
  const settings = await getUserSettings(userId)
  return (settings?.profileUrl ?? '').trim()
}

// ── Address classification (SSRF guard) — pure, unit-testable without DNS ─────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const o = Number(p)
    if (!Number.isInteger(o) || o < 0 || o > 255) return null
    n = (n << 8) | o
  }
  return n >>> 0
}

function ipv4InRange(n: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base)!
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (n & mask) === (b & mask)
}

function isDisallowedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true
  return ipv4InRange(n, '0.0.0.0', 8) // "this" network (incl. 0.0.0.0)
    || ipv4InRange(n, '10.0.0.0', 8) // private
    || ipv4InRange(n, '127.0.0.0', 8) // loopback
    || ipv4InRange(n, '169.254.0.0', 16) // link-local + cloud metadata (169.254.169.254)
    || ipv4InRange(n, '172.16.0.0', 12) // private
    || ipv4InRange(n, '192.168.0.0', 16) // private
}

function isDisallowedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]! // drop any zone id
  if (addr === '::' || addr === '::1') return true // unspecified / loopback
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true // fe80::/10 link-local
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
  if (mapped) return isDisallowedIpv4(mapped[1]!)
  return false
}

/**
 * True when an IP literal is one the profile fetch must never reach: loopback,
 * link-local (169.254.0.0/16, fe80::/10), private (10/8, 172.16/12, 192.168/16,
 * fc00::/7), or 0.0.0.0 / ::. A string that isn't a valid IP is treated as
 * disallowed. Exported so classification can be tested without touching DNS.
 */
export function isDisallowedAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isDisallowedIpv4(ip)
  if (version === 6) return isDisallowedIpv6(ip)
  return true
}

// ── Bounding the document — pure, unit-testable ──────────────────────────────

/** True for the content types we accept as a profile document (text only). */
export function isTextProfileContentType(contentType: string | null): boolean {
  const ct = (contentType ?? '').toLowerCase()
  return ct.includes('text/plain') || ct.includes('text/markdown')
}

/**
 * Trim the document to MAX_PROFILE_BYTES on a line boundary, appending an
 * explicit `[profile truncated]` marker so the model knows it is incomplete.
 * Byte-based (not char) so multi-byte content can't exceed the cap.
 */
export function boundProfileText(raw: string): string {
  const text = raw.trim()
  if (Buffer.byteLength(text, 'utf8') <= MAX_PROFILE_BYTES) return text
  let slice = Buffer.from(text, 'utf8').subarray(0, MAX_PROFILE_BYTES).toString('utf8')
  const lastNl = slice.lastIndexOf('\n')
  if (lastNl > 0) slice = slice.slice(0, lastNl)
  return `${slice.trimEnd()}\n\n[profile truncated]`
}

/**
 * `Map.set` that drops the oldest entry once the map exceeds `max` (Maps keep
 * insertion order), so the URL-keyed profile cache can't grow without bound.
 */
export function cacheSetBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.set(key, value)
  if (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────--

async function loadProfile(url: string): Promise<string> {
  const parsed = new URL(url)
  // Defence in depth — the settings boundary already enforces https.
  if (parsed.protocol !== 'https:') {
    console.warn('[profile] refusing non-https url', url)
    return ''
  }
  // Resolve the host and refuse if ANY resolved address is internal (all: true
  // covers hosts that publish several A/AAAA records).
  const addresses = await lookup(parsed.hostname, { all: true })
  if (!addresses.length || addresses.some(a => isDisallowedAddress(a.address))) {
    console.warn('[profile] refusing private/loopback host', parsed.hostname)
    return ''
  }
  // redirect: 'error' — a permitted host must not be able to bounce to an
  // internal one; a 3xx rejects the promise and degrades to no profile.
  const res = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'text/plain, text/markdown' }
  })
  if (!res.ok) {
    console.warn('[profile] non-ok status', res.status, url)
    return ''
  }
  // Require a text document — HTML/JSON/binary is not a profile.
  if (!isTextProfileContentType(res.headers.get('content-type'))) {
    console.warn('[profile] unexpected content-type', res.headers.get('content-type') ?? '(none)', url)
    return ''
  }
  return boundProfileText(await res.text())
}

/**
 * Fetch + cache a profile document by URL. Returns an empty string when unset or
 * on ANY failure/rejection — never throws, so the chat still streams.
 */
export async function fetchProfile(url: string): Promise<string> {
  if (!url) return ''
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text

  let text = ''
  try {
    text = await loadProfile(url)
  } catch (err) {
    console.warn('[profile] could not fetch', url, '-', (err as Error).message)
  }
  // Cache the result (empty on failure — negative caching is deliberate),
  // bounded so the map can't grow without limit.
  cacheSetBounded(cache, url, { text, at: Date.now() }, MAX_CACHE_ENTRIES)
  return text
}

// ── Fencing as untrusted reference data ──────────────────────────────────────

const PROFILE_TAG = 'user_profile'

/**
 * Fence a fetched profile as a delimited, explicitly-untrusted block for the
 * system prompt. A remote, mutable document must not gain system-message
 * authority (several MCP tools perform writes), so any closing delimiter inside
 * the document is neutralized — a hostile doc can't end the block early and
 * smuggle in content after it.
 */
export function wrapUserProfile(text: string, url: string): string {
  const safe = text.replace(new RegExp(`<\\s*/\\s*${PROFILE_TAG}\\s*>`, 'gi'), `[/${PROFILE_TAG}]`)
  const source = url.replace(/"/g, '&quot;')
  return `<${PROFILE_TAG} source="${source}" trust="untrusted">\n${safe}\n</${PROFILE_TAG}>`
}
