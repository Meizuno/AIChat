<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({ title: 'AI Chat' })

const { user, refresh } = useAuth()
const route = useRoute()

// SSR + client auth check
await callOnce(async () => {
  await refresh()
})

if (!user.value && route.path !== '/login') {
  await navigateTo('/login')
}

watch(user, (val) => {
  if (!val && route.path !== '/login') navigateTo('/login')
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
