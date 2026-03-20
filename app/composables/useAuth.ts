export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

type RefreshResponse = {
  accessToken: string
  user: AuthUser
}

type MeResponse = {
  user: AuthUser | null
}

export const useAuth = () => {
  const accessToken = useState<string | null>('auth_access_token', () => null)
  const user = useState<AuthUser | null>('auth_user', () => null)
  const refreshing = useState<boolean>('auth_refreshing', () => false)
  const initialized = useState<boolean>('auth_initialized', () => false)
  const initPromise = useState<Promise<boolean> | null>('auth_init_promise', () => null)

  const loggedIn = computed(() => Boolean(user.value))

  const getServerCookieHeaders = () => (process.server ? useRequestHeaders(['cookie']) : undefined)

  const fetchMe = async () => {
    try {
      const headers = getServerCookieHeaders()
      const result = await $fetch<MeResponse>('/api/auth/me', { headers })
      user.value = result.user
      return Boolean(result.user)
    }
    catch {
      user.value = null
      return false
    }
  }

  const refresh = async () => {
    if (refreshing.value) return Boolean(accessToken.value)
    refreshing.value = true
    try {
      const headers = getServerCookieHeaders()
      const result = await $fetch<RefreshResponse>('/api/auth/refresh', {
        method: 'POST',
        headers
      })
      accessToken.value = result.accessToken
      user.value = result.user
      return true
    }
    catch {
      accessToken.value = null
      user.value = null
      return false
    }
    finally {
      refreshing.value = false
      initialized.value = true
    }
  }

  const ensureInitialized = async () => {
    if (initialized.value) return Boolean(accessToken.value)
    if (!initPromise.value) {
      initPromise.value = (async () => {
        const hasSessionFromAccess = await fetchMe()
        if (hasSessionFromAccess) {
          initialized.value = true
          return true
        }
        return await refresh()
      })().finally(() => {
        initPromise.value = null
      })
    }
    return await initPromise.value
  }

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch {}
    accessToken.value = null
    user.value = null
  }

  const apiFetch = async <T>(url: string, options: Parameters<typeof $fetch>[1] = {}) => {
    const headers = new Headers(options?.headers as HeadersInit | undefined)
    if (accessToken.value) headers.set('authorization', `Bearer ${accessToken.value}`)
    try {
      return await $fetch<T>(url, { ...options, headers })
    }
    catch (error: unknown) {
      const status = (error as { statusCode?: number })?.statusCode ?? 0
      if (status === 401) {
        const ok = await refresh()
        if (ok && accessToken.value) {
          headers.set('authorization', `Bearer ${accessToken.value}`)
          return await $fetch<T>(url, { ...options, headers })
        }
      }
      throw error
    }
  }

  return { accessToken, user, loggedIn, refreshing, initialized, refresh, ensureInitialized, logout, apiFetch }
}
