<script setup lang="ts">
defineProps({ id: { type: String, default: undefined } })
</script>

<template>
  <h1 :id="id" class="mt-6 mb-3 text-2xl font-bold tracking-tight text-highlighted">
    <slot />
  </h1>
</template>
