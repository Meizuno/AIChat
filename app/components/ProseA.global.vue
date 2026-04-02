<script setup lang="ts">
defineProps({
  href: { type: String, default: '' },
  target: { type: String, default: undefined }
})
</script>

<template>
  <NuxtLink
    :href="href"
    :target="target"
    class="font-medium text-primary underline underline-offset-4 hover:opacity-75"
  >
    <slot />
  </NuxtLink>
</template>
