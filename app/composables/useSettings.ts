// Client-side use-case for the user's settings (currently just the profile
// URL). Loads once, saves on demand. Kept small — mirrors useMcpServers.
export function useSettings() {
  const profileUrl = ref('')
  const loading = ref(false)
  const saving = ref(false)

  const load = async () => {
    loading.value = true
    try {
      profileUrl.value = (await $fetch<{ profileUrl: string }>('/api/settings')).profileUrl
    } catch (err) {
      console.warn('[settings]', err)
    } finally {
      loading.value = false
    }
  }

  const save = async () => {
    saving.value = true
    try {
      const res = await $fetch<{ profileUrl: string }>('/api/settings', {
        method: 'PATCH',
        body: { profileUrl: profileUrl.value.trim() }
      })
      profileUrl.value = res.profileUrl
    } finally {
      saving.value = false
    }
  }

  return { profileUrl, loading, saving, load, save }
}
