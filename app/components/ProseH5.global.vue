<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h5 :id="id" class="mt-3 mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
    <slot />
  </h5>
</template>
