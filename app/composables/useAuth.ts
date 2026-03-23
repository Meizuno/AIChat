export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth_user', () => null)
  const initialized = useState<boolean>('auth_initialized', () => false)
  const initPromise = useState<Promise<boolean> | null>('auth_init_promise', () => null)

  const loggedIn = computed(() => Boolean(user.value))

  const fetchMe = async () => {
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const result = await $fetch<{ user: AuthUser | null }>('/api/auth/me', { headers })
      user.value = result.user
      return Boolean(result.user)
    }
    catch {
      user.value = null
      return false
    }
  }

  const ensureInitialized = async () => {
    if (initialized.value) return loggedIn.value
    if (!initPromise.value) {
      initPromise.value = fetchMe().then(ok => {
        initialized.value = true
        return ok
      }).finally(() => {
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
    user.value = null
    initialized.value = true
  }

  return { user, loggedIn, initialized, fetchMe, ensureInitialized, logout }
}
