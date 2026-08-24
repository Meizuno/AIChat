<script setup lang="ts">
// Grid cell (div, not <th>). Honors the markdown column alignment (`:---` /
// `:---:` / `---:`) MDC passes as `align`; default left. Matches ProseTd so a
// column and its heading share alignment.
const props = defineProps<{ align?: string | null }>()
const alignClass = computed(() =>
  props.align === 'right'
    ? 'text-right'
    : props.align === 'center'
      ? 'text-center'
      : 'text-left'
)
</script>

<template>
  <div
    role="columnheader"
    :class="[alignClass, 'bg-slate-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400']"
  >
    <slot />
  </div>
</template>
