<script setup lang="ts">
import type { ServerStatus, UserMcpServer } from '#shared/types/mcp'

// MCP servers section of the Settings page: add a URL (with an optional name and
// the "use auth token" checkbox), see each server's live connection status
// (fetched via the shared useMcpStatus probe), toggle/enable, and delete.
const { servers, loading, refresh, add, update, remove } = useMcpServers()
const { status: mcpStatus, loading: statusLoading, refresh: refreshStatus } = useMcpStatus()

const url = ref('')
const name = ref('')
const useAuth = ref(false)
const submitting = ref(false)
const formError = ref<string | null>(null)

onMounted(() => {
  refresh()
  refreshStatus()
})

// Live probe status keyed by server name, for the per-row indicator.
const statusByName = computed(() => {
  const map: Record<string, ServerStatus> = {}
  for (const s of mcpStatus.value?.servers ?? []) map[s.name] = s
  return map
})

function errorMessage(err: unknown, fallback: string): string {
  return (err as { data?: { message?: string } })?.data?.message ?? fallback
}

// Re-probe after any change so the row status (and the sidebar health dot,
// which reads the same shared status) stays current.
async function submit() {
  if (!url.value.trim()) {
    formError.value = 'URL is required'
    return
  }
  submitting.value = true
  formError.value = null
  try {
    await add({ url: url.value.trim(), name: name.value.trim() || undefined, useAuth: useAuth.value })
    url.value = ''
    name.value = ''
    useAuth.value = false
    refreshStatus()
  } catch (err) {
    formError.value = errorMessage(err, 'Failed to add server')
  } finally {
    submitting.value = false
  }
}

async function toggleEnabled(server: UserMcpServer) {
  await update(server.id, { enabled: !server.enabled })
  refreshStatus()
}

async function toggleAuth(server: UserMcpServer) {
  await update(server.id, { useAuth: !server.useAuth })
  refreshStatus()
}

async function removeServer(id: string) {
  await remove(id)
  refreshStatus()
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        MCP servers
      </h2>
      <p class="text-sm text-muted mt-1">
        Connect your own MCP servers. Tools are fetched live when you connect.
      </p>
    </div>

    <!-- Add form -->
    <form
      class="space-y-3"
      @submit.prevent="submit"
    >
      <UFormField
        label="Server URL"
        required
      >
        <UInput
          v-model="url"
          placeholder="https://example.com/api/mcp"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Name"
        hint="optional"
      >
        <UInput
          v-model="name"
          placeholder="Defaults to the URL host"
          class="w-full"
        />
      </UFormField>

      <div class="flex items-start gap-3 rounded-lg bg-elevated/50 px-3 py-2.5">
        <USwitch v-model="useAuth" />
        <div class="text-sm">
          <p class="font-medium">
            Use auth token
          </p>
          <p class="text-muted text-xs">
            Send your signed-in access token to this server. Enable only for servers you trust.
          </p>
        </div>
      </div>

      <p
        v-if="formError"
        class="text-sm text-error"
      >
        {{ formError }}
      </p>

      <UButton
        type="submit"
        label="Add server"
        icon="i-lucide-plus"
        :loading="submitting"
      />
    </form>

    <USeparator />

    <!-- User's servers with live status -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-xs font-semibold text-highlighted uppercase tracking-wider">
          Your servers
        </p>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Refresh status"
          :loading="statusLoading"
          @click="refreshStatus"
        />
      </div>

      <div
        v-if="servers.length"
        class="space-y-1.5"
      >
        <div
          v-for="server in servers"
          :key="server.id"
          class="flex items-center gap-3 rounded-lg border border-default px-3 py-2.5"
          :class="{ 'opacity-50': !server.enabled }"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium truncate">{{ server.name }}</span>
              <UBadge
                v-if="server.useAuth"
                color="primary"
                variant="soft"
                size="xs"
                label="auth"
              />
            </div>
            <p class="text-xs text-muted truncate">
              {{ server.url }}
            </p>
          </div>

          <!-- Live status (enabled servers only; disabled ones aren't probed) -->
          <McpServerStatus
            v-if="server.enabled"
            :status="statusByName[server.name]"
          />

          <UButton
            :icon="server.useAuth ? 'i-lucide-shield-check' : 'i-lucide-shield-off'"
            :color="server.useAuth ? 'primary' : 'neutral'"
            variant="ghost"
            size="xs"
            title="Toggle auth token"
            @click="toggleAuth(server)"
          />
          <UButton
            :icon="server.enabled ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            color="neutral"
            variant="ghost"
            size="xs"
            title="Enable / disable"
            @click="toggleEnabled(server)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            title="Delete"
            @click="removeServer(server.id)"
          />
        </div>
      </div>

      <p
        v-else-if="loading"
        class="text-sm text-muted py-3"
      >
        Loading…
      </p>
      <p
        v-else
        class="text-sm text-muted py-3"
      >
        No servers yet. Add one above.
      </p>
    </div>
  </section>
</template>
