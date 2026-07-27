<script setup lang="ts">
import { isTextUIPart, isToolUIPart, isFileUIPart, DefaultChatTransport } from 'ai'
import type { FileUIPart, UIMessage } from 'ai'
import { Chat } from '@ai-sdk/vue'
import type { PromptItem } from '#shared/types/prompt'
import type { AppConfigResponse } from '#shared/types/config'

function normalizeMarkdownForMdc(value: string) {
  const fences = (value.match(/^```/gm) || []).length
  if (fences % 2 !== 0) return value + '\n```'
  return value
}

const { user, logout } = useAuth()
const input = ref('')

const {
  status: mcpStatus,
  loading: mcpLoading,
  color: mcpColor,
  refresh: fetchMcpStatus
} = useMcpStatus()
onMounted(fetchMcpStatus)

const { data: appConfig } = await useFetch<AppConfigResponse>('/api/config', { key: 'app-config' })

const welcomeMessage = computed(() => appConfig.value?.defaults.welcomeMessage ?? '')
const botName = computed(() => appConfig.value?.defaults.botName ?? '')
const promptGroups = computed(() => appConfig.value?.promptGroups ?? [])
const flatPrompts = computed(() =>
  promptGroups.value.flatMap(g => g.prompts.map(p => ({ ...p, server: g.server })))
)

const promptLoading = ref(false)

async function useSuggestedPrompt(item: PromptItem) {
  if (promptLoading.value || chat.value.status !== 'ready') return
  if (item.route) {
    promptLoading.value = true
    const userId = crypto.randomUUID()
    const placeholderId = crypto.randomUUID()

    // Add user + loading assistant placeholder in a single assignment
    chat.value.messages = [
      ...chat.value.messages,
      {
        id: userId,
        role: 'user',
        parts: [{ type: 'text' as const, text: item.label }],
        metadata: undefined
      },
      {
        id: placeholderId,
        role: 'assistant',
        parts: [{ type: 'text' as const, text: '' }],
        metadata: undefined
      }
    ]

    try {
      const data = await $fetch<Record<string, unknown>>(item.route)
      const blockType = (data.component as string) ?? 'chart'
      const text = typeof data.text === 'string'
        ? data.text
        : '```' + blockType + '\n' + JSON.stringify(data) + '\n```'

      // Replace placeholder with a *new* message id so Vue remounts MDC
      // (reusing the same id lets MDC's async compile cache overwrite the
      // populated content with the stale empty one on fast responses).
      chat.value.messages = [
        ...chat.value.messages.filter(m => m.id !== placeholderId),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text' as const, text }],
          metadata: undefined
        }
      ]
      scrollAfterRender()
    } catch (err) {
      console.warn('[Suggested Prompt]', err)
      chat.value.messages = chat.value.messages.filter(m => m.id !== placeholderId && m.id !== userId)
    } finally {
      promptLoading.value = false
    }
  } else if (item.prompt) {
    input.value = item.prompt
    onSubmit()
  }
}

const { usage, accumulate: accumulateUsage, estimatedCost } = useUsage(() => appConfig.value?.pricing)
const copiedMessageId = ref<string | null>(null)

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}

// The active conversation. Its id is sent with each request so the server
// persists the turn. Switching chats means a fresh Chat instance (the id is
// fixed at construction), so `chat` is a shallowRef we reassign.
const activeChatId = ref<string>(crypto.randomUUID())

function makeChat(id: string, messages: UIMessage[] = []) {
  return new Chat({
    id,
    messages,
    transport: new DefaultChatTransport(),
    onData(part) {
      if (part.type === 'data-usage') {
        accumulateUsage(part.data as { inputTokens?: number, outputTokens?: number, totalTokens?: number })
      }
    },
    onError(error) {
      console.error(error)
    }
  })
}

const chat = shallowRef(makeChat(activeChatId.value))

// Mobile slideover open state — closed after picking/creating a chat.
const sidebarOpen = ref(false)

// Chat history list for the sidebar.
type ChatListItem = { id: string, title: string, updatedAt: string }
const chats = ref<ChatListItem[]>([])
async function refreshChats() {
  chats.value = await $fetch<ChatListItem[]>('/api/chats')
}
onMounted(refreshChats)

function newChat() {
  activeChatId.value = crypto.randomUUID()
  chat.value = makeChat(activeChatId.value)
  sidebarOpen.value = false
}

async function openChat(id: string) {
  sidebarOpen.value = false
  if (id === activeChatId.value) return
  const data = await $fetch<{ messages: Array<{ id: string, role: string, parts: unknown }> }>(`/api/chats/${id}`)
  const messages = data.messages.map(m => ({ id: m.id, role: m.role, parts: m.parts, metadata: undefined })) as UIMessage[]
  activeChatId.value = id
  chat.value = makeChat(id, messages)
}

async function deleteChatById(id: string) {
  await $fetch(`/api/chats/${id}`, { method: 'DELETE' })
  await refreshChats()
  if (id === activeChatId.value) newChat()
}

// Inline rename: clicking Rename swaps the title for an input.
const editingId = ref<string | null>(null)
const editingTitle = ref('')
// When the dropdown closes it restores focus to its trigger, which blurs the
// just-autofocused input. Ignore blur until this "armed" flag flips, so that
// focus-restore blur doesn't submit before the user can type. Enter always
// saves regardless.
let renameArmed = false

function startRename(c: ChatListItem) {
  editingId.value = c.id
  editingTitle.value = c.title
  renameArmed = false
  setTimeout(() => {
    renameArmed = true
  }, 250)
}

async function submitRename() {
  const id = editingId.value
  const title = editingTitle.value.trim()
  editingId.value = null
  if (!id || !title) return
  await $fetch(`/api/chats/${id}`, { method: 'PATCH', body: { title } })
  await refreshChats()
}

// Blur only saves once armed (skips the dropdown's focus-restore blur).
function onRenameBlur() {
  if (renameArmed) submitRename()
}

// Per-chat ⋯ menu (works on touch, unlike a hover-only button).
function chatMenu(c: ChatListItem) {
  return [[
    { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(c) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteChatById(c.id) }
  ]]
}

// The active chat as it appears in the list (undefined for a brand-new,
// unsaved chat). Drives the page-header title + its rename/delete menu.
const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value))
const currentTitle = computed(() => activeChat.value?.title || 'New chat')
const currentChatMenu = computed(() => (activeChat.value ? chatMenu(activeChat.value) : []))

// After a turn completes the title/updatedAt change server-side — refresh the
// sidebar list so a new chat's derived title and ordering show up.
watch(() => chat.value.status, (status, prev) => {
  if (prev === 'streaming' && status === 'ready') refreshChats()
})

function onSubmit(files: FileUIPart[] = []) {
  chat.value.sendMessage({ text: input.value, files })
  input.value = ''
  // UChatMessages pins the new user message to the top and reserves space
  // below it (via --last-message-height) until the response fills the screen.
}

function getMessageText(message: { parts?: unknown[] }) {
  if (!message.parts) return ''
  return (message.parts as Parameters<typeof isTextUIPart>[0][])
    .filter(part => isTextUIPart(part))
    .map(part => part.text)
    .join('\n\n')
    .trim()
}

function imageParts(message: { parts?: unknown[] }): FileUIPart[] {
  if (!message.parts) return []
  return (message.parts as Parameters<typeof isFileUIPart>[0][])
    .filter(part => isFileUIPart(part))
    .filter(part => part.mediaType.startsWith('image/'))
}

async function copyMessage(message: { id: string, parts?: unknown[] }) {
  const text = getMessageText(message)
  if (!text) return
  await navigator.clipboard.writeText(text)
  copiedMessageId.value = message.id
  setTimeout(() => {
    if (copiedMessageId.value === message.id) copiedMessageId.value = null
  }, 1500)
}

function canShowCopy(message: { id: string, role: string, parts?: unknown[] }) {
  const lastMessage = chat.value.messages[chat.value.messages.length - 1]
  const isLatestAssistant = message.role === 'assistant' && lastMessage?.id === message.id
  const isGenerating = chat.value.status === 'submitted' || chat.value.status === 'streaming'
  if (isLatestAssistant && isGenerating) return false
  return !!getMessageText(message)
}

const scrollContainer = ref<HTMLElement | null>(null)

function scrollAfterRender() {
  if (!scrollContainer.value) return
  const observer = new MutationObserver(() => {
    scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight, behavior: 'smooth' })
  })
  observer.observe(scrollContainer.value, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 2000)
}

// Pull down past the threshold = clear the chat (full-page reload).
// Disabled while a stream is in flight so a long completion can't
// be killed by an errant gesture.
const {
  distance: pullDistance,
  pulling: isPulling,
  ready: pullReady
} = usePullToRefresh(scrollContainer, {
  canPull: () => chat.value.status !== 'streaming' && chat.value.status !== 'submitted'
})
</script>

<template>
  <UDashboardGroup class="h-svh">
    <!-- Sidebar: logo in the header, user component in the footer -->
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
        @click="newChat"
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
              @click="openChat(c.id)"
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
                  <UButton
                    icon="i-lucide-refresh-cw"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="mcpLoading"
                    @click="fetchMcpStatus"
                  />
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

    <!-- Main chat panel -->
    <UDashboardPanel>
      <!-- Page header: current chat name + rename/delete (+ sidebar toggle on mobile) -->
      <UDashboardNavbar>
        <template #title>
          <UInput
            v-if="editingId === activeChatId"
            v-model="editingTitle"
            size="sm"
            autofocus
            @keydown.enter="submitRename"
            @keydown.esc="editingId = null"
            @blur="onRenameBlur"
          />
          <div
            v-else
            class="flex items-center gap-1 min-w-0"
          >
            <span class="truncate">{{ currentTitle }}</span>
            <!-- Rename/delete the current chat, right next to its name -->
            <UDropdownMenu
              v-if="activeChat"
              :items="currentChatMenu"
              :content="{ align: 'start' }"
            >
              <UButton
                icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-muted shrink-0"
                aria-label="Chat options"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardNavbar>

      <div
        ref="scrollContainer"
        class="flex-1 min-h-0 overflow-y-auto flex flex-col scroll-pt-16"
      >
        <!-- Pull-to-refresh indicator -->
        <div
          class="shrink-0 overflow-hidden flex items-center justify-center"
          :class="{ 'transition-[height] duration-200 ease-out': !isPulling }"
          :style="{ height: pullDistance + 'px' }"
        >
          <div class="flex items-center gap-2 text-xs text-muted">
            <UIcon
              :name="pullReady ? 'i-lucide-refresh-cw' : 'i-lucide-arrow-down'"
              class="size-4 transition-transform"
              :class="{ 'text-primary': pullReady }"
            />
            <span :class="{ 'text-primary': pullReady }">{{ pullReady ? 'Release to refresh' : 'Pull to refresh' }}</span>
          </div>
        </div>

        <div class="flex-1 pt-4">
          <div
            v-if="chat.messages.length === 0 && welcomeMessage"
            class="max-w-3xl mx-auto px-4 py-8 sm:py-16 flex flex-col items-center gap-4 sm:gap-6"
          >
            <div class="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <img
                src="/favicon.svg"
                class="w-6 h-6 sm:w-8 sm:h-8"
                alt="bot icon"
              >
            </div>
            <div class="text-center">
              <p
                v-if="botName"
                class="font-semibold text-base"
              >
                {{ botName }}
              </p>
              <p class="text-sm text-muted mt-1">
                {{ welcomeMessage }}
              </p>
            </div>
            <div
              v-if="flatPrompts.length"
              class="flex flex-wrap justify-center gap-2 max-w-2xl"
            >
              <button
                v-for="item in flatPrompts"
                :key="`${item.server}:${item.label}`"
                class="group flex items-center gap-2 rounded-xl border border-default bg-default/50 p-1 pr-3 text-left hover:bg-elevated hover:border-primary/50 transition-all cursor-pointer"
                @click="useSuggestedPrompt(item)"
              >
                <div class="size-6 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <UIcon
                    :name="item.route ? 'i-lucide-zap' : 'i-lucide-message-circle'"
                    class="size-4 text-primary"
                  />
                </div>
                <span class="flex-1 text-sm font-medium leading-tight truncate">{{ item.label }}</span>
              </button>
            </div>
          </div>
          <UChatMessages
            class="max-w-3xl mx-auto px-4"
            :messages="chat.messages"
            :status="chat.status"
            :user="{ ui: { content: 'bg-transparent p-0 text-default' } }"
          >
            <template #indicator>
              <UIcon
                name="i-svg-spinners-3-dots-scale"
                class="size-12 text-muted"
              />
            </template>
            <template #content="{ message }">
              <!-- User text is plain: render it directly so it shows instantly.
                   MDC compiles asynchronously, which would briefly blank the
                   bubble on submit. Assistant messages keep MDC for Markdown. -->
              <template v-if="message.role === 'user'">
                <div class="flex flex-col items-end gap-1.5">
                  <!-- Attachments: above the message, outside the bubble, small. -->
                  <div
                    v-if="imageParts(message).length"
                    dir="rtl"
                    class="grid grid-cols-2 gap-1.5"
                  >
                    <img
                      v-for="(img, i) in imageParts(message)"
                      :key="i"
                      :src="img.url"
                      :alt="img.filename"
                      class="size-24 object-cover rounded-xl"
                    >
                  </div>
                  <!-- Claude-style user bubble: subtle neutral surface, right-aligned. -->
                  <p
                    v-if="getMessageText(message)"
                    class="bg-elevated text-default rounded-xl px-4 py-2.5 whitespace-pre-wrap wrap-break-word max-w-full"
                  >
                    {{ getMessageText(message) }}
                  </p>
                </div>
              </template>
              <template
                v-for="(part, index) in message.parts"
                v-else
                :key="`${message.id}-${part.type}-${index}`"
              >
                <MDC
                  v-if="isTextUIPart(part)"
                  :value="normalizeMarkdownForMdc(part.text)"
                  :cache-key="`${message.id}-${index}-${Math.floor(part.text.length / 80)}`"
                  class="*:first:mt-0 *:last:mb-0"
                />
              </template>
            </template>
            <template #actions="{ message }">
              <div class="flex items-center gap-2">
                <UBadge
                  v-if="message.role === 'assistant' && message.parts.some(p => isToolUIPart(p))"
                  label="MCP"
                  color="success"
                  variant="subtle"
                  size="sm"
                />
                <UButton
                  v-if="canShowCopy(message)"
                  :icon="copiedMessageId === message.id ? 'i-lucide-check' : 'i-lucide-copy'"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  :aria-label="copiedMessageId === message.id ? 'Copied' : 'Copy message'"
                  @click="copyMessage(message)"
                />
              </div>
            </template>
          </UChatMessages>
        </div>

        <div
          data-chat-footer
          class="sticky bottom-0 z-20 shrink-0 p-6 bg-opacity-0"
        >
          <div class="max-w-3xl mx-auto relative">
            <Transition name="usage">
              <div
                v-if="usage"
                class="absolute -top-6 right-1 flex items-center gap-3 text-xs text-muted"
              >
                <span>↑ {{ usage.inputTokens?.toLocaleString() }}</span>
                <span>↓ {{ usage.outputTokens?.toLocaleString() }}</span>
                <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
              </div>
            </Transition>
            <ChatPrompt
              v-model="input"
              :status="chat.status"
              :error="chat.error"
              :disabled="promptLoading"
              :prompt-groups="promptGroups"
              @submit="onSubmit"
              @stop="chat.stop()"
              @prompt="useSuggestedPrompt($event)"
            />
          </div>
        </div>
      </div>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<style scoped>
button {
  cursor: pointer;
}

.usage-enter-active {
  transition: all 0.3s ease;
}
.usage-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
</style>
