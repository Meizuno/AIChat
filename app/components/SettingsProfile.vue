<script setup lang="ts">
// Profile section of the Settings page: a public profile URL (e.g. an llms.txt)
// the assistant fetches so it knows who it works for. Prepended to the system
// prompt server-side.
const { profileUrl, savingProfile, ensureLoaded, saveProfile } = useSettings()

const saved = ref(false)
const error = ref<string | null>(null)

onMounted(ensureLoaded)

async function onSubmit() {
  error.value = null
  try {
    await saveProfile()
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2000)
  } catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save'
  }
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold">
        Profile
      </h2>
      <p class="text-sm text-muted mt-1">
        A public profile URL (e.g. an <code>llms.txt</code>) the assistant reads so it knows who it works for.
        Leave empty to disable.
      </p>
    </div>

    <form
      class="space-y-3"
      @submit.prevent="onSubmit"
    >
      <UFormField
        label="Profile URL"
        hint="optional"
      >
        <UInput
          v-model="profileUrl"
          type="url"
          placeholder="https://example.com/llms.txt"
          class="w-full"
        />
      </UFormField>

      <p
        v-if="error"
        class="text-sm text-error"
      >
        {{ error }}
      </p>

      <div class="flex items-center gap-3">
        <UButton
          type="submit"
          label="Save"
          icon="i-lucide-check"
          :loading="savingProfile"
        />
        <span
          v-if="saved"
          class="text-sm text-muted"
        >Saved</span>
      </div>
    </form>
  </section>
</template>
