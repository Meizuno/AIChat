<script setup lang="ts">
const DEFAULT_COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

const el = useTemplateRef<HTMLElement>('li')
const index = computed(() => {
  if (!el.value) return 0
  const parent = el.value.parentElement
  if (!parent) return 0
  return Array.from(parent.children).indexOf(el.value)
})
const isOrdered = computed(() => {
  if (!el.value) return false
  return el.value.closest('[data-list-type="ordered"]') !== null
})
const color = computed(() => DEFAULT_COLORS[index.value % DEFAULT_COLORS.length])
</script>

<template>
  <li
    ref="li"
    class="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/50"
  >
    <div
      class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      :style="{ backgroundColor: color }"
    >
      {{ isOrdered ? index + 1 : '•' }}
    </div>
    <span class="text-sm leading-relaxed text-slate-800 dark:text-slate-100"><slot /></span>
  </li>
</template>
