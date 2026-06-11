import type { McpStatus } from '#shared/types/mcp'

// Polled snapshot of the configured MCP servers. The popover next to
// the user dropdown reads `status` for the per-server list and
// `color` for the status-light tint. `refresh()` is wired to the
// reload button so the user can probe a flapping server without a
// full page refresh.
//
// Failures are soft: a thrown $fetch yields the empty-servers shape
// so the UI doesn't have to special-case `null` for "fetched but
// failed".
export function useMcpStatus() {
  const status = ref<McpStatus | null>(null)
  const loading = ref(false)

  const color = computed(() => {
    if (!status.value) return '#94a3b8' // loading — gray
    const servers = status.value.servers ?? []
    const connectedCount = servers.filter(s => s.connected).length
    if (connectedCount === servers.length) return '#22c55e' // all — green
    if (connectedCount > 0) return '#eab308' // partial — yellow
    return '#ef4444' // none — red
  })

  const refresh = async () => {
    loading.value = true
    try {
      status.value = await $fetch<McpStatus>('/api/mcp-status')
    } catch (err) {
      console.warn('[MCP Status]', err)
      status.value = { connected: false, toolCount: 0, tools: [], servers: [] }
    } finally {
      loading.value = false
    }
  }

  return { status, loading, color, refresh }
}
