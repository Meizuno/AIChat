<script setup lang="ts">
// Dashboard shell shared by the app's authed pages: the sidebar (chat history +
// user/MCP menu) plus a slot for the page's own panel. The sidebar and the
// conversation state live in composables, so switching pages (chat ↔ servers)
// keeps the sidebar mounted and the active chat intact.
</script>

<template>
  <UDashboardGroup class="h-svh">
    <AppSidebar />
    <slot />
  </UDashboardGroup>
</template>
