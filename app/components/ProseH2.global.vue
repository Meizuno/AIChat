<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h2 :id="id" class="mt-5 mb-2 text-xl font-semibold tracking-tight text-highlighted">
    <slot />
  </h2>
</template>
