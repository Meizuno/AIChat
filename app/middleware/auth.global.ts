export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, initialized, ensureInitialized } = useAuth()

  if (!initialized.value) {
    await ensureInitialized()
  }

  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo('/login')
  }

  if (loggedIn.value && to.path === '/login') {
    return navigateTo('/')
  }
})
