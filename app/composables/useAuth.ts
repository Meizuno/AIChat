export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth_user', () => null)
  const loggedIn = computed(() => Boolean(user.value))

  const refresh = async (): Promise<boolean> => {
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me', { headers })
      user.value = data.user
      return true
    }
    catch {
      user.value = null
      return false
    }
  }

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch {}
    user.value = null
    await navigateTo('/login')
  }

  let pendingRefresh: Promise<void> | null = null

  const apiFetch = async <T>(url: string, options: Parameters<typeof $fetch>[1] = {}) => {
    try {
      return await $fetch<T>(url, options)
    }
    catch (error: unknown) {
      const status = (error as { statusCode?: number })?.statusCode ?? 0
      if (status === 401) {
        try {
          if (!pendingRefresh) {
            pendingRefresh = $fetch('/api/auth/refresh', { method: 'POST' })
              .then(() => { pendingRefresh = null })
              .catch(() => { pendingRefresh = null })
          }
          await pendingRefresh
          return await $fetch<T>(url, options)
        }
        catch {
          user.value = null
          await navigateTo('/login')
        }
      }
      throw error
    }
  }

  return { user, loggedIn, refresh, logout, apiFetch }
}
