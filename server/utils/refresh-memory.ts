import { randomUUID } from 'node:crypto'
import type { AuthUser } from './auth'

type RefreshSession = {
  user: AuthUser
  expiresAt: number
}

const globalKey = '__aic_refresh_sessions__'
const g = globalThis as typeof globalThis & { [globalKey]?: Map<string, RefreshSession> }
const sessions = g[globalKey] ?? new Map<string, RefreshSession>()
g[globalKey] = sessions

const now = () => Date.now()

const purgeExpired = () => {
  const ts = now()
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= ts) sessions.delete(token)
  }
}

export const createRefreshSession = (user: AuthUser, ttlSeconds: number) => {
  purgeExpired()
  const token = randomUUID()
  sessions.set(token, { user, expiresAt: now() + ttlSeconds * 1000 })
  return token
}

export const rotateRefreshSession = (token: string, ttlSeconds: number) => {
  purgeExpired()
  const current = sessions.get(token)
  if (!current || current.expiresAt <= now()) {
    sessions.delete(token)
    return null
  }
  sessions.delete(token)
  const nextToken = randomUUID()
  sessions.set(nextToken, { user: current.user, expiresAt: now() + ttlSeconds * 1000 })
  return { token: nextToken, user: current.user }
}

export const revokeRefreshSession = (token: string) => {
  sessions.delete(token)
}
