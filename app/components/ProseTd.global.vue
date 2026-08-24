<script setup lang="ts">
// Grid cell (div, not <td>). Honors the markdown column alignment MDC passes as
// `align`; default left. Matches ProseTh so numeric columns can right-align.
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
    role="cell"
    :class="[alignClass, 'px-4 py-3 text-sm text-slate-700 dark:text-slate-200']"
  >
    <slot />
  </div>
</template>
