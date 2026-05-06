<script setup lang="ts">
type NoteDetailPayload = {
  note: {
    id: number
    title: string
    content: string
    folder: string | null
    updated_at: string
  }
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as NoteDetailPayload }
  catch { return null }
})
</script>

<template>
  <div v-if="parsed?.note" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="mb-3 flex items-center gap-2">
      <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
        {{ parsed.note.title }}
      </h2>
      <span
        v-if="parsed.note.folder"
        class="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
      >
        <UIcon name="i-lucide-folder" class="h-2.5 w-2.5" />
        {{ parsed.note.folder }}
      </span>
    </div>
    <div v-if="parsed.note.content" class="prose prose-sm dark:prose-invert max-w-none *:first:mt-0 *:last:mb-0">
      <MDC :value="parsed.note.content" :cache-key="`note-detail-${parsed.note.id}`" />
    </div>
    <p v-else class="text-xs text-slate-400 italic">No content</p>
  </div>
</template>
