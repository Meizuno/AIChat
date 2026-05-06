<script setup lang="ts">
type Folder = { label: string, count: number }
type NoteItem = {
  id: number
  title: string
  folder: string | null
  snippet: string | null
  hasContent: boolean
  updated_at: string
}
type NotesPayload = {
  folders: Folder[]
  notes: NoteItem[]
  total: number
  hasMore: boolean
  activeFolder?: string
  activeSearch?: string
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as NotesPayload }
  catch { return null }
})

const localData = ref<NotesPayload | null>(parsed.value)
watch(parsed, val => { localData.value = val })

const PAGE_SIZE = 10

const activeFolder = ref(parsed.value?.activeFolder ?? '')
const search = ref(parsed.value?.activeSearch ?? '')
const notes = ref<NoteItem[]>(parsed.value?.notes ?? [])
const total = ref(parsed.value?.total ?? 0)
const page = ref(1)
const searching = ref(false)

const expandedId = ref<number | null>(null)
const noteContent = ref<Map<number, string>>(new Map())
const contentLoading = ref<number | null>(null)

// "" is the root bucket; render it as a friendly label so the chip
// reads as a place rather than as an empty string.
const folderLabel = (label: string) => label === '' ? 'Root' : label

function buildParams(p: number) {
  const q = search.value.trim()
  return {
    limit: PAGE_SIZE,
    offset: (p - 1) * PAGE_SIZE,
    ...(activeFolder.value ? { folder: activeFolder.value } : {}),
    ...(q ? { search: q } : {})
  }
}

let reloadSeq = 0

async function fetchPage(p: number) {
  const mySeq = ++reloadSeq
  searching.value = true
  try {
    const data = await $fetch<NotesPayload>('/api/prompts/notes', { params: buildParams(p) })
    if (mySeq !== reloadSeq) return
    notes.value = data.notes
    total.value = data.total
    expandedId.value = null
  }
  catch (err) {
    if (mySeq === reloadSeq) console.warn('[notes] fetch failed:', err)
  }
  finally {
    if (mySeq === reloadSeq) searching.value = false
  }
}

watch(page, p => fetchPage(p))

async function toggleFolder(label: string) {
  activeFolder.value = activeFolder.value === label ? '' : label
  if (page.value !== 1) page.value = 1
  else await fetchPage(1)
}

const SEARCH_DEBOUNCE_MS = 500
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (val, oldVal) => {
  if ((val ?? '').trim() === (oldVal ?? '').trim()) return
  if (searchTimer) clearTimeout(searchTimer)
  searching.value = true
  searchTimer = setTimeout(() => {
    searchTimer = null
    if (page.value !== 1) page.value = 1
    else fetchPage(1)
  }, SEARCH_DEBOUNCE_MS)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

async function toggleNote(note: NoteItem) {
  if (expandedId.value === note.id) {
    expandedId.value = null
    return
  }
  expandedId.value = note.id
  if (!noteContent.value.has(note.id) && note.hasContent) {
    contentLoading.value = note.id
    try {
      const data = await $fetch<{ note: { content: string } }>('/api/prompts/notes', {
        params: { id: note.id }
      })
      noteContent.value.set(note.id, data.note?.content ?? '')
    }
    catch { /* ignore */ }
    finally { contentLoading.value = null }
  }
}

const { onEnter: onExpandEnter, onAfterEnter: onExpandAfterEnter, onLeave: onExpandLeave } = useExpandAnimation()
</script>

<template>
  <div v-if="localData" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-indigo-400/10 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-violet-400/10 blur-2xl" />

    <!-- Header -->
    <div class="mb-4 flex items-start justify-between gap-3">
      <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Knowledge base
        <template v-if="activeFolder || search">
          <span class="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
            <template v-if="activeFolder">in <span class="font-medium text-slate-700 dark:text-slate-200">{{ folderLabel(activeFolder) }}</span></template>
            <template v-if="search"> matching <span class="font-medium text-slate-700 dark:text-slate-200">"{{ search }}"</span></template>
          </span>
        </template>
      </p>
      <p class="shrink-0 text-xs text-slate-500 dark:text-slate-400">
        {{ total }} note{{ total === 1 ? '' : 's' }}
      </p>
    </div>

    <!-- Search -->
    <div class="relative mb-3">
      <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      <input
        v-model="search"
        type="search"
        placeholder="Search title or content…"
        class="w-full rounded-lg border border-slate-200/70 bg-white/70 py-2 pl-9 pr-8 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200"
      >
      <UIcon
        v-if="searching"
        name="i-lucide-loader-2"
        class="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400"
      />
    </div>

    <!-- Folder filters -->
    <div v-if="localData.folders.length > 1" class="flex flex-wrap gap-1.5 mb-4">
      <button
        v-for="folder in localData.folders"
        :key="folder.label || '__root__'"
        class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
        :class="activeFolder === folder.label
          ? 'bg-indigo-500 text-white'
          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'"
        @click="toggleFolder(folder.label)"
      >
        <UIcon
          :name="folder.label === '' ? 'i-lucide-home' : 'i-lucide-folder'"
          class="h-3 w-3"
        />
        {{ folderLabel(folder.label) }}
        <span class="opacity-70">{{ folder.count }}</span>
      </button>
    </div>

    <!-- Note list -->
    <div class="space-y-2">
      <div
        v-for="note in notes"
        :key="note.id"
        class="rounded-xl border border-slate-200/70 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/50"
      >
        <div
          class="flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none"
          @click="toggleNote(note)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {{ note.title }}
              </span>
              <span
                v-if="note.folder"
                class="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
              >
                <UIcon name="i-lucide-folder" class="h-2.5 w-2.5" />
                {{ note.folder }}
              </span>
            </div>
            <p
              v-if="note.snippet && expandedId !== note.id"
              class="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1"
            >
              {{ note.snippet }}
            </p>
          </div>
          <UIcon
            v-if="note.hasContent"
            :name="expandedId === note.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
          />
        </div>

        <Transition
          @enter="onExpandEnter"
          @after-enter="onExpandAfterEnter"
          @leave="onExpandLeave"
        >
          <div v-if="expandedId === note.id" class="border-t border-slate-200/70 dark:border-slate-700/60 px-4 py-3">
            <div v-if="contentLoading === note.id" class="flex items-center gap-2 text-xs text-slate-400">
              <UIcon name="i-lucide-loader-2" class="h-3.5 w-3.5 animate-spin" />
              Loading note…
            </div>
            <div v-else-if="noteContent.get(note.id)" class="prose prose-sm dark:prose-invert max-w-none *:first:mt-0 *:last:mb-0">
              <MDC :value="noteContent.get(note.id)!" :cache-key="`note-${note.id}`" />
            </div>
            <p v-else class="text-xs text-slate-400 italic">No content</p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > PAGE_SIZE" class="mt-4 flex justify-center">
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="PAGE_SIZE"
        :sibling-count="1"
        size="xs"
      />
    </div>

    <!-- Empty state -->
    <p v-if="!notes.length && !searching" class="text-sm text-slate-400 text-center py-6">
      No notes found<template v-if="search"> matching "{{ search }}"</template><template v-if="activeFolder"> in "{{ folderLabel(activeFolder) }}"</template>
    </p>
  </div>
</template>
