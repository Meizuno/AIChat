<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h6 :id="id" class="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
    <slot />
  </h6>
</template>
