export default defineNuxtPlugin(async () => {
  const { user, refresh } = useAuth()
  // On client, user is already populated from SSR state — skip the fetch
  if (!user.value) {
    await refresh()
  }
})
