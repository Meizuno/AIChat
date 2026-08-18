import type { SuggestedPrompt } from '#shared/schemas/settings'

// Per-user settings: the profile URL the assistant reads and the user's
// suggested starter prompts. A module singleton so the Settings sections and
// the chat welcome screen share one source of truth — editing prompts in
// Settings updates the chat chips without a reload.
type SettingsResponse = { profileUrl: string, suggestedPrompts: SuggestedPrompt[] }

let store: ReturnType<typeof createStore> | null = null

function createStore() {
  const profileUrl = ref('')
  const suggestedPrompts = ref<SuggestedPrompt[]>([])
  const loading = ref(false)
  const savingProfile = ref(false)
  const savingPrompts = ref(false)
  let loaded = false

  const load = async () => {
    loading.value = true
    try {
      const s = await $fetch<SettingsResponse>('/api/settings')
      profileUrl.value = s.profileUrl
      suggestedPrompts.value = s.suggestedPrompts
      loaded = true
    } catch (err) {
      console.warn('[settings]', err)
    } finally {
      loading.value = false
    }
  }

  /** Load once (for read-only consumers like the chat welcome screen). */
  const ensureLoaded = async () => {
    if (!loaded && !loading.value) await load()
  }

  const saveProfile = async () => {
    savingProfile.value = true
    try {
      const s = await $fetch<SettingsResponse>('/api/settings', {
        method: 'PATCH',
        body: { profileUrl: profileUrl.value.trim() }
      })
      profileUrl.value = s.profileUrl
    } finally {
      savingProfile.value = false
    }
  }

  const savePrompts = async (prompts: SuggestedPrompt[]) => {
    savingPrompts.value = true
    try {
      const s = await $fetch<SettingsResponse>('/api/settings', {
        method: 'PATCH',
        body: { suggestedPrompts: prompts }
      })
      suggestedPrompts.value = s.suggestedPrompts
    } finally {
      savingPrompts.value = false
    }
  }

  return {
    profileUrl,
    suggestedPrompts,
    loading,
    savingProfile,
    savingPrompts,
    load,
    ensureLoaded,
    saveProfile,
    savePrompts
  }
}

export function useSettings() {
  if (!store) store = createStore()
  return store
}
