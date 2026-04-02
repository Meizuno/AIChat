<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h4 :id="id" class="mt-3 mb-1 text-base font-semibold text-highlighted">
    <slot />
  </h4>
</template>
