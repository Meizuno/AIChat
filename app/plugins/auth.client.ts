export default defineNuxtPlugin(async () => {
  const { ensureInitialized } = useAuth()
  await ensureInitialized()
})
