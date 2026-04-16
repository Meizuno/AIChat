<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({ title: 'AI Chat' })

const { user, refresh } = useAuth()
const route = useRoute()
const loading = ref(import.meta.client)

if (import.meta.client) {
  if (!user.value) {
    const refreshed = await $fetch('/api/auth/refresh', { method: 'POST' })
      .then(() => true)
      .catch(() => false)
    if (refreshed) await refresh()
  }
  loading.value = false
  if (!user.value && route.path !== '/login') await navigateTo('/login')
}

watch(user, (val) => {
  if (!val && route.path !== '/login') navigateTo('/login')
})
</script>

<template>
  <UApp>
    <div v-if="loading" class="flex min-h-screen items-center justify-center">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
    </div>
    <NuxtPage v-else />
  </UApp>
</template>
