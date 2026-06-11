import type { ViewerProfile } from '#shared/types/auth'

export const useAuth = () => {
  const user = useState<ViewerProfile | null>('auth_user', () => null)
  const loggedIn = computed(() => Boolean(user.value))

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Logout is best-effort: even if the network call fails we
      // still clear local state and redirect to /login.
    }
    user.value = null
    await navigateTo('/login')
  }

  return { user, loggedIn, logout }
}
