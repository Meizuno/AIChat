<script setup lang="ts">
// Settings page (default layout → sidebar + this panel). Sections: the profile
// URL the assistant reads, and the user's MCP servers with live status. The
// panels own their own data + status refresh (via shared composables), so the
// sidebar health dot stays in sync too.
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
          <span class="truncate">Settings</span>
        </div>
      </template>
    </UDashboardNavbar>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <SettingsProfile />
        <USeparator />
        <McpServersPanel />
      </div>
    </div>
  </UDashboardPanel>
</template>
