<script setup lang="ts">
// MCP servers management page. Lives in the same dashboard shell as the chat
// (default layout → sidebar + this panel). Re-probes the shared MCP status on
// any change so the sidebar health dots stay current.
const { refresh: fetchMcpStatus } = useMcpStatus()
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar>
      <template #title>
        <div class="flex items-center gap-1.5 min-w-0">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Back to chat"
            to="/"
          />
          <span class="truncate">MCP servers</span>
        </div>
      </template>
    </UDashboardNavbar>

    <McpServersPanel @changed="fetchMcpStatus" />
  </UDashboardPanel>
</template>
