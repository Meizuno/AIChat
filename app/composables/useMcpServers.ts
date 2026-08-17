import type { CreateMcpServerInput, UpdateMcpServerInput } from '#shared/schemas/mcp-servers'
import type { UserMcpServer } from '#shared/types/mcp'

// Client-side use-case for managing the user's own MCP servers (the settings
// list). CRUD over /api/mcp-servers; each mutation refetches the list so the
// caller renders a single source of truth. The live tool status stays in
// useMcpStatus — this only owns the connection records.
export function useMcpServers() {
  const servers = ref<UserMcpServer[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const refresh = async () => {
    loading.value = true
    error.value = null
    try {
      servers.value = await $fetch<UserMcpServer[]>('/api/mcp-servers')
    } catch (err) {
      console.warn('[MCP servers]', err)
      error.value = 'Failed to load servers'
    } finally {
      loading.value = false
    }
  }

  const add = async (input: CreateMcpServerInput) => {
    await $fetch('/api/mcp-servers', { method: 'POST', body: input })
    await refresh()
  }

  const update = async (id: string, patch: UpdateMcpServerInput) => {
    await $fetch(`/api/mcp-servers/${id}`, { method: 'PATCH', body: patch })
    await refresh()
  }

  const remove = async (id: string) => {
    await $fetch(`/api/mcp-servers/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { servers, loading, error, refresh, add, update, remove }
}
