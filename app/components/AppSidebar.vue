<script setup lang="ts">
// The dashboard sidebar: app logo, new-chat + chat history, and the user
// popover (MCP status, manage-servers link, logout). Shared across pages via
// the default layout. All conversation state comes from useConversations so the
// list + active chat stay in sync with the chat workspace.
const { user, logout } = useAuth()
const {
  sidebarOpen,
  chats,
  activeChatId,
  newChat,
  openChat,
  editingId,
  editingTitle,
  submitRename,
  onRenameBlur,
  chatMenu
} = useConversations()

const {
  status: mcpStatus,
  loading: mcpLoading,
  color: mcpColor,
  refresh: fetchMcpStatus
} = useMcpStatus()

onMounted(() => {
  fetchMcpStatus()
})

const userMenuOpen = ref(false)

function newChatAndGo() {
  newChat()
  navigateTo('/')
}

async function selectChat(id: string) {
  await openChat(id)
  navigateTo('/')
}

function openServers() {
  userMenuOpen.value = false
  sidebarOpen.value = false
  navigateTo('/servers')
}

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <UDashboardSidebar
    v-model:open="sidebarOpen"
    toggle-side="right"
  >
    <template #header>
      <NuxtLink
        to="/"
        class="flex items-center gap-2"
      >
        <img
          src="/favicon.svg"
          class="w-6 h-6"
          alt="logo"
        >
        <span class="font-semibold text-sm">Meizuno AI</span>
      </NuxtLink>
    </template>

    <!-- New chat + history list -->
    <UButton
      icon="i-lucide-plus"
      label="New chat"
      color="neutral"
      variant="soft"
      block
      class="justify-start"
      @click="newChatAndGo"
    />
    <div class="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 space-y-0.5">
      <div
        v-for="c in chats"
        :key="c.id"
        class="group flex items-center gap-1 rounded-lg pr-1"
        :class="c.id === activeChatId ? 'bg-elevated' : 'hover:bg-elevated/60'"
      >
        <!-- Rename mode: inline input -->
        <UInput
          v-if="editingId === c.id"
          v-model="editingTitle"
          size="xs"
          autofocus
          class="flex-1 m-1"
          @keydown.enter="submitRename"
          @keydown.esc="editingId = null"
          @blur="onRenameBlur"
        />
        <template v-else>
          <button
            class="flex-1 min-w-0 text-left text-sm px-2 py-1.5 truncate"
            @click="selectChat(c.id)"
          >
            {{ c.title }}
          </button>
          <UDropdownMenu
            :items="chatMenu(c)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
              class="text-muted"
              aria-label="Chat options"
              @click.stop
            />
          </UDropdownMenu>
        </template>
      </div>
      <p
        v-if="!chats.length"
        class="text-xs text-muted text-center py-4"
      >
        No chats yet
      </p>
    </div>

    <template #footer>
      <!-- User component — click opens a popover with MCP status + logout -->
      <UPopover
        v-model:open="userMenuOpen"
        :content="{ side: 'top', align: 'start', sideOffset: 8 }"
        class="w-full"
      >
        <UButton
          variant="ghost"
          color="neutral"
          class="w-full justify-start gap-2"
        >
          <UAvatar
            :src="user?.picture ?? undefined"
            :alt="user?.name ?? undefined"
            size="2xs"
          />
          <span class="flex-1 text-left text-sm font-medium truncate">{{ user?.name }}</span>
          <!-- At-a-glance MCP health dot -->
          <span
            class="size-2 rounded-full shrink-0"
            :class="{ 'animate-pulse': mcpStatus === null || mcpLoading }"
            :style="{ backgroundColor: mcpColor }"
          />
          <UIcon
            name="i-lucide-chevron-up"
            class="size-4 text-muted shrink-0"
          />
        </UButton>

        <template #content>
          <div class="w-72 p-2 space-y-2">
            <!-- User header -->
            <div class="flex items-center gap-2 px-1 py-1">
              <UAvatar
                :src="user?.picture ?? undefined"
                :alt="user?.name ?? undefined"
                size="sm"
              />
              <div class="min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ user?.name }}
                </p>
                <p
                  v-if="user?.email"
                  class="text-xs text-muted truncate"
                >
                  {{ user.email }}
                </p>
              </div>
            </div>

            <USeparator />

            <!-- MCP servers status -->
            <div>
              <div class="flex items-center justify-between px-1 mb-1">
                <p class="text-xs font-semibold text-highlighted uppercase tracking-wider">
                  MCP Servers
                </p>
                <div class="flex items-center gap-0.5">
                  <UButton
                    icon="i-lucide-settings-2"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    title="Manage servers"
                    @click="openServers"
                  />
                  <UButton
                    icon="i-lucide-refresh-cw"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="mcpLoading"
                    @click="fetchMcpStatus"
                  />
                </div>
              </div>

              <div
                v-if="mcpStatus?.servers?.length"
                class="space-y-0.5"
              >
                <div
                  v-for="server in mcpStatus.servers"
                  :key="server.name"
                  class="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-elevated transition-colors"
                >
                  <span
                    class="w-2 h-2 rounded-full shrink-0"
                    :class="server.connected ? 'bg-green-500' : 'bg-red-500'"
                  />
                  <span class="flex-1 text-sm font-medium truncate">{{ server.name }}</span>
                  <span
                    v-if="server.connected"
                    class="text-xs text-muted shrink-0"
                  >{{ server.toolCount }} tool{{ server.toolCount === 1 ? '' : 's' }}</span>
                  <span
                    v-else
                    class="text-xs text-red-500 shrink-0"
                  >unreachable</span>
                </div>
              </div>

              <div
                v-else-if="mcpStatus === null"
                class="space-y-1"
              >
                <div
                  v-for="i in 2"
                  :key="i"
                  class="flex items-center gap-2.5 px-2 py-2"
                >
                  <USkeleton class="w-2 h-2 rounded-full shrink-0" />
                  <USkeleton class="h-3 flex-1 rounded" />
                  <USkeleton class="h-3 w-12 rounded" />
                </div>
              </div>

              <p
                v-else
                class="text-xs text-muted text-center py-2"
              >
                No servers configured
              </p>
            </div>

            <USeparator />

            <UButton
              icon="i-lucide-log-out"
              label="Log out"
              color="error"
              variant="ghost"
              size="sm"
              block
              class="justify-start"
              @click="handleLogout"
            />
          </div>
        </template>
      </UPopover>
    </template>
  </UDashboardSidebar>
</template>
