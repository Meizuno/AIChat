// Per-user "who am I working for" context. Each user can point the assistant at
// a public profile document (an llms.txt-style page) via their settings; it's
// fetched and prepended to their system prompt. Purely per-user — no built-in
// default; unset means no profile is injected.
//
// Documents are cached by URL for TTL_MS so they aren't refetched every turn;
// a redeploy or TTL expiry (or pointing at a new URL) picks up edits. Any fetch
// failure is cached as empty so a flapping host can't slow every message.

const TTL_MS = 60 * 60 * 1000
const cache = new Map<string, { text: string, at: number }>()

/** The profile URL a user configured in their settings (empty when unset). */
export async function getUserProfileUrl(userId: string): Promise<string> {
  const settings = await getUserSettings(userId)
  return (settings?.profileUrl ?? '').trim()
}

/** Fetch + cache a profile document by URL. Empty string when unset or on error. */
export async function fetchProfile(url: string): Promise<string> {
  if (!url) return ''
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text

  let text = ''
  try {
    const raw = await $fetch<string>(url, { responseType: 'text' })
    text = typeof raw === 'string' ? raw.trim() : ''
  } catch (err) {
    console.warn('[profile] could not fetch', url, '-', (err as Error).message)
  }
  cache.set(url, { text, at: Date.now() })
  return text
}

/** The resolved profile text for a user (their configured/ default profile). */
export async function getUserProfile(userId: string): Promise<string> {
  return fetchProfile(await getUserProfileUrl(userId))
}
