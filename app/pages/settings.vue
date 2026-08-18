<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

// Settings page (default layout → sidebar + this panel). Vertical tabs: the tab
// list navigates config sections on the left, the active section's form renders
// on the right. Section panels own their own data/status via shared composables.
const items = [
  { label: 'Profile', icon: 'i-lucide-circle-user', slot: 'profile' as const, value: 'profile' },
  { label: 'Suggested prompts', icon: 'i-lucide-sparkles', slot: 'prompts' as const, value: 'prompts' },
  { label: 'MCP servers', icon: 'i-lucide-server', slot: 'servers' as const, value: 'servers' }
] satisfies TabsItem[]

const active = ref('profile')
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar :ui="{ title: 'text-sm' }">
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

    <UTabs
      v-model="active"
      :items="items"
      variant="link"
      :ui="{
        root: 'flex-1 min-h-0 gap-0 my-0',
        list: 'shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6',
        trigger: 'flex-1',
        content: 'flex-1 min-w-0 overflow-y-auto'
      }"
    >
      <template #profile>
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <SettingsProfile />
        </div>
      </template>
      <template #prompts>
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <SettingsPrompts />
        </div>
      </template>
      <template #servers>
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <McpServersPanel />
        </div>
      </template>
    </UTabs>
  </UDashboardPanel>
</template>
