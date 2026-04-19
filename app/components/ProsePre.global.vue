<script setup lang="ts">
import ProseChart from './content/ProseChart.global.vue'
import ProseRecipes from './content/ProseRecipes.global.vue'
import ProseRecipeDetail from './content/ProseRecipeDetail.global.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: null },
  filename: { type: String, default: null },
  highlights: { type: Array, default: () => [] },
  meta: { type: String, default: null },
  class: { type: String, default: null }
})
</script>

<template>
  <ProseChart v-if="language === 'chart'" :code="code" />
  <ProseRecipes v-else-if="language === 'recipes'" :code="code" />
  <ProseRecipeDetail v-else-if="language === 'recipe-detail'" :code="code" />
  <div v-else class="group my-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-950 shadow-sm dark:border-slate-700/60">
    <div v-if="filename || language" class="flex items-center justify-between border-b border-slate-700/60 bg-slate-900 px-4 py-2">
      <span class="font-mono text-xs text-slate-400">{{ filename || language }}</span>
    </div>
    <div class="overflow-x-auto">
      <pre :class="[$props.class, 'p-4 text-sm leading-relaxed']"><slot /></pre>
    </div>
  </div>
</template>
