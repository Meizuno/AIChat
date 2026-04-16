<script setup lang="ts">
type RecipeDetailPayload = {
  recipe: {
    id: number
    title: string
    content: string
    tags: string[]
    updated_at: string
  }
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as RecipeDetailPayload }
  catch { return null }
})
</script>

<template>
  <div v-if="parsed?.recipe" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
      {{ parsed.recipe.title }}
    </h2>
    <div v-if="parsed.recipe.tags.length" class="flex flex-wrap gap-1.5 mb-4">
      <span
        v-for="tag in parsed.recipe.tags"
        :key="tag"
        class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400"
      >{{ tag }}</span>
    </div>
    <div v-if="parsed.recipe.content" class="prose prose-sm dark:prose-invert max-w-none *:first:mt-0 *:last:mb-0">
      <MDC :value="parsed.recipe.content" :cache-key="`recipe-detail-${parsed.recipe.id}`" />
    </div>
  </div>
</template>
