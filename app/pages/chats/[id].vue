<script setup lang="ts">
// Route-driven chat: the `id` param says which chat to show — `new` for a fresh
// one, a uuid for a saved one. The conversation state lives in useConversations
// (a singleton shared with the sidebar), so the page just tells it to sync the
// active chat to the route. Client-only: the Chat instance + history load run in
// the browser (matching the rest of the app's client-side data fetching).
const route = useRoute()
const { syncToChat } = useConversations()

if (import.meta.client) {
  watch(() => route.params.id, id => syncToChat(String(id)), { immediate: true })
}
</script>

<template>
  <ChatWorkspace />
</template>
