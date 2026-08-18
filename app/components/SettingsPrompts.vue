<script setup lang="ts">
import type { SuggestedPrompt } from '#shared/schemas/settings'

// Suggested-prompts section of the Settings page: the user's own starter
// prompts (label + message) shown on the chat welcome screen and prompt picker.
// Edits a local copy; Save persists it (via the shared useSettings store, so the
// chat chips update without a reload).
const { suggestedPrompts, savingPrompts, ensureLoaded, savePrompts } = useSettings()

const rows = ref<SuggestedPrompt[]>([])
const saved = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  await ensureLoaded()
  rows.value = suggestedPrompts.value.map(p => ({ ...p }))
})

function addRow() {
  rows.value.push({ label: '', prompt: '' })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

async function onSave() {
  error.value = null
  // Drop blank rows; both fields are required.
  const cleaned = rows.value
    .map(r => ({ label: r.label.trim(), prompt: r.prompt.trim() }))
    .filter(r => r.label && r.prompt)
  try {
    await savePrompts(cleaned)
    rows.value = suggestedPrompts.value.map(p => ({ ...p }))
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
        Suggested prompts
      </h2>
      <p class="text-sm text-muted mt-1">
        Starter prompts shown on the welcome screen and the prompt picker. A short label and the message it sends.
      </p>
    </div>

    <div
      v-if="rows.length"
      class="space-y-2"
    >
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="flex items-start gap-2"
      >
        <UInput
          v-model="row.label"
          placeholder="Label"
          class="w-40 shrink-0"
        />
        <UInput
          v-model="row.prompt"
          placeholder="Message to send"
          class="flex-1"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="`Remove prompt ${i + 1}`"
          @click="removeRow(i)"
        />
      </div>
    </div>
    <p
      v-else
      class="text-sm text-muted"
    >
      No suggested prompts yet.
    </p>

    <p
      v-if="error"
      class="text-sm text-error"
    >
      {{ error }}
    </p>

    <div class="flex items-center gap-3">
      <UButton
        label="Add prompt"
        icon="i-lucide-plus"
        color="neutral"
        variant="subtle"
        @click="addRow"
      />
      <UButton
        label="Save"
        icon="i-lucide-check"
        :loading="savingPrompts"
        @click="onSave"
      />
      <span
        v-if="saved"
        class="text-sm text-muted"
      >Saved</span>
    </div>
  </section>
</template>
