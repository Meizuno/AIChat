export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth_user', () => null)
  const loggedIn = computed(() => Boolean(user.value))

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch {}
    user.value = null
    await navigateTo('/login')
  }

  return { user, loggedIn, logout }
}
