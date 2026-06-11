<script setup lang="ts">
import ProseChart from './content/ProseChart.global.vue'
import ProseRecipes from './content/ProseRecipes.global.vue'
import ProseRecipeDetail from './content/ProseRecipeDetail.global.vue'
import ProseNotes from './content/ProseNotes.global.vue'
import ProseNoteDetail from './content/ProseNoteDetail.global.vue'

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
  <ProseChart
    v-if="language === 'chart'"
    :code="code"
  />
  <ProseRecipes
    v-else-if="language === 'recipes'"
    :code="code"
  />
  <ProseRecipeDetail
    v-else-if="language === 'recipe-detail'"
    :code="code"
  />
  <ProseNotes
    v-else-if="language === 'notes'"
    :code="code"
  />
  <ProseNoteDetail
    v-else-if="language === 'note-detail'"
    :code="code"
  />
  <!-- Code-block surface is theme-aware: a Snow-Storm-ish slate-50
       panel in light mode (so the github-light Shiki tokens read
       cleanly) and the existing near-black slate-950 in dark mode.
       Filename header sits one slate tier above the panel in each
       mode so it reads as a label strip without competing visually
       with the syntax tokens. -->
  <div
    v-else
    class="group my-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50 shadow-sm dark:border-slate-700/60 dark:bg-slate-950"
  >
    <div
      v-if="filename || language"
      class="flex items-center justify-between border-b border-slate-200/70 bg-slate-100 px-4 py-2 dark:border-slate-700/60 dark:bg-slate-900"
    >
      <span class="font-mono text-xs text-slate-600 dark:text-slate-400">{{ filename || language }}</span>
    </div>
    <div class="overflow-x-auto">
      <pre :class="[$props.class, 'p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200']"><slot /></pre>
    </div>
  </div>
</template>
