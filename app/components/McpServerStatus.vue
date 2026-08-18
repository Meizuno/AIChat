<script setup lang="ts">
import type { ServerStatus } from '#shared/types/mcp'

// Compact live-status indicator for one MCP server row on the Settings page.
// `status` is undefined until the probe returns (or when the server is disabled
// and therefore not probed) — shown as "checking…".
defineProps<{ status?: ServerStatus }>()
</script>

<template>
  <div class="flex items-center gap-1.5 shrink-0">
    <template v-if="status">
      <span
        class="size-2 rounded-full"
        :class="status.connected ? 'bg-green-500' : 'bg-red-500'"
      />
      <span class="text-xs text-muted whitespace-nowrap">
        {{ status.connected ? `${status.toolCount} tool${status.toolCount === 1 ? '' : 's'}` : 'unreachable' }}
      </span>
    </template>
    <span
      v-else
      class="text-xs text-muted whitespace-nowrap"
    >checking…</span>
  </div>
</template>
