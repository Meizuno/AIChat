<script setup lang="ts">
import type { ViewerProfile } from '#shared/types/auth'

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({ title: 'AI Chat' })

const { user } = useAuth()
const route = useRoute()

// SSR seam: /api/auth/me may rotate the auth cookies (access + refresh) when it
// refreshes an expired session. Set-Cookie written inside an internal SSR fetch
// does NOT reach the browser on its own — so without forwarding it, the client
// keeps the old, now-consumed refresh token and the next request triggers reuse
// detection (a surprise logout). Forward the rotated pair onto the document
// response so it actually lands in the browser.
const requestEvent = import.meta.server ? useRequestEvent() : null

const { data } = await useFetch<{ user: ViewerProfile }>('/api/auth/me', {
  onResponse({ response }) {
    if (!import.meta.server || !requestEvent) return
    const setCookies = response.headers.getSetCookie?.() ?? []
    for (const cookie of setCookies) appendResponseHeader(requestEvent, 'set-cookie', cookie)
  }
})
user.value = data.value?.user ?? null

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
