<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h3 :id="id" class="mt-4 mb-2 text-lg font-semibold text-highlighted">
    <slot />
  </h3>
</template>
