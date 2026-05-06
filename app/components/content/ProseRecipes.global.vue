<script setup lang="ts">
type Tag = { id: number, label: string, color: string }
type RecipeItem = { id: number, title: string, tags: string[], hasContent: boolean }
type RecipesPayload = {
  tags: Tag[]
  recipes: RecipeItem[]
  total: number
  hasMore: boolean
  activeTag?: string
  activeSearch?: string
}

const TAILWIND_COLORS: Record<string, string> = {
  cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
  rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
  orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
  green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as RecipesPayload }
  catch { return null }
})

const localData = ref<RecipesPayload | null>(parsed.value)
watch(parsed, val => { localData.value = val })

const PAGE_SIZE = 10

const activeTag = ref(parsed.value?.activeTag ?? '')
const search = ref(parsed.value?.activeSearch ?? '')
const recipes = ref<RecipeItem[]>(parsed.value?.recipes ?? [])
const total = ref(parsed.value?.total ?? 0)
const page = ref(1)
const searching = ref(false)

const expandedId = ref<number | null>(null)
const recipeContent = ref<Map<number, string>>(new Map())
const contentLoading = ref<number | null>(null)

const colorMap = computed(() => {
  const map = new Map<string, string>()
  for (const tag of localData.value?.tags ?? []) {
    map.set(tag.label, TAILWIND_COLORS[tag.color] ?? '#94a3b8')
  }
  return map
})

const filteredRecipes = computed(() => {
  if (!activeTag.value) return recipes.value
  return recipes.value.filter(r => r.tags.includes(activeTag.value))
})

function buildParams(p: number) {
  const q = search.value.trim()
  return {
    limit: PAGE_SIZE,
    offset: (p - 1) * PAGE_SIZE,
    ...(activeTag.value ? { tag: activeTag.value } : {}),
    ...(q ? { search: q } : {})
  }
}

let reloadSeq = 0

async function fetchPage(p: number) {
  const mySeq = ++reloadSeq
  searching.value = true
  try {
    const data = await $fetch<RecipesPayload>('/api/prompts/recipes', { params: buildParams(p) })
    if (mySeq !== reloadSeq) return
    recipes.value = data.recipes
    total.value = data.total
    expandedId.value = null
  }
  catch (err) {
    if (mySeq === reloadSeq) console.warn('[recipes] fetch failed:', err)
  }
  finally {
    if (mySeq === reloadSeq) searching.value = false
  }
}

// Page changes (next / prev / direct page click) re-fetch from server.
// Filter changes (tag toggle, search) reset to page 1, which triggers
// the same watcher.
watch(page, p => fetchPage(p))

async function toggleTag(label: string) {
  activeTag.value = activeTag.value === label ? '' : label
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

async function toggleRecipe(recipe: RecipeItem) {
  if (expandedId.value === recipe.id) {
    expandedId.value = null
    return
  }
  expandedId.value = recipe.id
  if (!recipeContent.value.has(recipe.id) && recipe.hasContent) {
    contentLoading.value = recipe.id
    try {
      const data = await $fetch<{ recipe: { content: string } }>('/api/prompts/recipes', {
        params: { id: recipe.id }
      })
      recipeContent.value.set(recipe.id, data.recipe?.content ?? '')
    }
    catch { /* ignore */ }
    finally { contentLoading.value = null }
  }
}

const { onEnter: onExpandEnter, onAfterEnter: onExpandAfterEnter, onLeave: onExpandLeave } = useExpandAnimation()
</script>

<template>
  <div v-if="localData" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-orange-400/10 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl" />

    <!-- Header -->
    <div class="mb-4 flex items-start justify-between gap-3">
      <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Recipes
        <template v-if="activeTag || search">
          <span class="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
            <template v-if="activeTag">tagged <span class="font-medium text-slate-700 dark:text-slate-200">{{ activeTag }}</span></template>
            <template v-if="search"> matching <span class="font-medium text-slate-700 dark:text-slate-200">"{{ search }}"</span></template>
          </span>
        </template>
      </p>
      <p class="shrink-0 text-xs text-slate-500 dark:text-slate-400">
        {{ total }} recipe{{ total === 1 ? '' : 's' }}
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

    <!-- Tag filters -->
    <div v-if="localData.tags.length" class="flex flex-wrap gap-1.5 mb-4">
      <button
        v-for="tag in localData.tags"
        :key="tag.id"
        class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer"
        :style="{
          backgroundColor: activeTag === tag.label ? (TAILWIND_COLORS[tag.color] ?? '#94a3b8') : (TAILWIND_COLORS[tag.color] ?? '#94a3b8') + '18',
          color: activeTag === tag.label ? '#fff' : (TAILWIND_COLORS[tag.color] ?? '#94a3b8')
        }"
        @click="toggleTag(tag.label)"
      >
        {{ tag.label }}
      </button>
    </div>

    <!-- Recipe list -->
    <div class="space-y-2">
      <div
        v-for="recipe in filteredRecipes"
        :key="recipe.id"
        class="rounded-xl border border-slate-200/70 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/50"
      >
        <div
          class="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
          @click="toggleRecipe(recipe)"
        >
          <span class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {{ recipe.title }}
          </span>
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              v-for="tag in recipe.tags"
              :key="tag"
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: colorMap.get(tag) ?? '#94a3b8' }"
            />
          </div>
          <UIcon
            v-if="recipe.hasContent"
            :name="expandedId === recipe.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="h-3.5 w-3.5 shrink-0 text-slate-400"
          />
        </div>

        <Transition
          @enter="onExpandEnter"
          @after-enter="onExpandAfterEnter"
          @leave="onExpandLeave"
        >
          <div v-if="expandedId === recipe.id" class="border-t border-slate-200/70 dark:border-slate-700/60 px-4 py-3">
            <div v-if="contentLoading === recipe.id" class="flex items-center gap-2 text-xs text-slate-400">
              <UIcon name="i-lucide-loader-2" class="h-3.5 w-3.5 animate-spin" />
              Loading recipe…
            </div>
            <div v-else-if="recipeContent.get(recipe.id)" class="prose prose-sm dark:prose-invert max-w-none *:first:mt-0 *:last:mb-0">
              <MDC :value="recipeContent.get(recipe.id)!" :cache-key="`recipe-${recipe.id}`" />
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
    <p v-if="!filteredRecipes.length && !searching" class="text-sm text-slate-400 text-center py-6">
      No recipes found<template v-if="search"> matching "{{ search }}"</template><template v-if="activeTag"> tagged "{{ activeTag }}"</template>
    </p>
  </div>
</template>
