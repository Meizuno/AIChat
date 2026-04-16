<script setup lang="ts">
import { isTextUIPart, isToolUIPart, DefaultChatTransport } from 'ai'
import { Chat } from '@ai-sdk/vue'

function normalizeMarkdownForMdc(value: string) {
  const fences = (value.match(/^```/gm) || []).length
  if (fences % 2 !== 0) return value + '\n```'
  return value
}

const { user, logout } = useAuth()
const input = ref('')
const MCP_DISPLAY_NAME = 'Money Manager'

type ServerStatus = { name: string, connected: boolean, toolCount: number, tools: string[] }
type McpStatus = { connected: boolean, toolCount: number, tools: string[], servers: ServerStatus[] }
const mcpStatus = ref<McpStatus | null>(null)
const mcpLoading = ref(false)

const fetchMcpStatus = async () => {
  mcpLoading.value = true
  try {
    mcpStatus.value = await $fetch<McpStatus>('/api/mcp-status')
  }
  catch {
    mcpStatus.value = { connected: false, toolCount: 0, tools: [] }
  }
  finally { mcpLoading.value = false }
}

onMounted(() => {
  fetchMcpStatus()
  const interval = setInterval(fetchMcpStatus, 120_000)
  onUnmounted(() => clearInterval(interval))
})

type PromptItem = { label: string, prompt?: string, route?: string }
type PromptGroup = { server: string, prompts: PromptItem[] }
type AppConfig = { defaults: { welcomeMessage: string, botName: string }, promptGroups: PromptGroup[] }

const appConfig = useState<AppConfig | null>('app-config', () => null)

const welcomeMessage = computed(() => appConfig.value?.defaults.welcomeMessage ?? '')
const botName = computed(() => appConfig.value?.defaults.botName ?? '')
const promptGroups = computed(() => appConfig.value?.promptGroups ?? [])

onMounted(async () => {
  if (appConfig.value) return
  try {
    appConfig.value = await $fetch<AppConfig>('/api/config')
  }
  catch { /* ignore */ }
})

const promptLoading = ref(false)

async function useSuggestedPrompt(item: { label: string, prompt?: string, route?: string }) {
  if (promptLoading.value || chat.status !== 'ready') return
  if (item.route) {
    promptLoading.value = true
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()

    // Show user message immediately
    chat.messages = [...chat.messages, {
      id: userId,
      role: 'user',
      parts: [{ type: 'text' as const, text: item.label }],
      metadata: undefined
    }]

    // Show loading assistant message
    chat.messages = [...chat.messages, {
      id: assistantId,
      role: 'assistant',
      parts: [{ type: 'text' as const, text: '' }],
      metadata: undefined
    }]

    try {
      const data = await $fetch<Record<string, unknown>>(item.route)
      const blockType = (data.component as string) ?? 'chart'
      const text = typeof data.text === 'string'
        ? data.text
        : '```' + blockType + '\n' + JSON.stringify(data) + '\n```'
      chat.messages = chat.messages.map(m =>
        m.id === assistantId
          ? { ...m, parts: [{ type: 'text' as const, text }] }
          : m
      )
      scrollAfterRender()
    }
    catch {
      chat.messages = chat.messages.filter(m => m.id !== assistantId && m.id !== userId)
    }
    finally {
      promptLoading.value = false
    }
  }
  else if (item.prompt) {
    input.value = item.prompt
    onSubmit()
  }
}

const usage = ref<{ inputTokens: number, outputTokens: number, totalTokens: number } | null>(null)
const copiedMessageId = ref<string | null>(null)

const PRICE_INPUT = 2.50
const PRICE_OUTPUT = 10.00

const estimatedCost = computed(() => {
  if (!usage.value) return null
  const cost = ((usage.value.inputTokens ?? 0) / 1_000_000) * PRICE_INPUT
    + ((usage.value.outputTokens ?? 0) / 1_000_000) * PRICE_OUTPUT
  return cost < 0.01 ? '< $0.01' : `$${cost.toFixed(4)}`
})

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}

const userMenuItems = computed(() => [
  [
    {
      label: user.value?.name ?? '',
      avatar: { src: user.value?.picture ?? undefined, alt: user.value?.name ?? undefined },
      disabled: true
    }
  ],
  [
    {
      label: 'Log out',
      icon: 'i-lucide-log-out',
      color: 'error' as const,
      onSelect: handleLogout
    }
  ]
])

const chat = new Chat({
  transport: new DefaultChatTransport(),
  onData(part) {
    if (part.type === 'data-usage') {
      const delta = part.data as { inputTokens: number, outputTokens: number, totalTokens: number }
      const prev = usage.value
      usage.value = {
        inputTokens: (prev?.inputTokens ?? 0) + (delta.inputTokens ?? 0),
        outputTokens: (prev?.outputTokens ?? 0) + (delta.outputTokens ?? 0),
        totalTokens: (prev?.totalTokens ?? 0) + (delta.totalTokens ?? 0)
      }
    }
  },
  onError(error) {
    console.error(error)
  }
})

function onSubmit() {
  chat.sendMessage({ text: input.value })
  input.value = ''
  scrollToBottom(true)
}

function getMessageText(message: { parts?: unknown[] }) {
  if (!message.parts) return ''
  return (message.parts as Parameters<typeof isTextUIPart>[0][])
    .filter(part => isTextUIPart(part))
    .map(part => part.text)
    .join('\n\n')
    .trim()
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
  const lastMessage = chat.messages[chat.messages.length - 1]
  const isLatestAssistant = message.role === 'assistant' && lastMessage?.id === message.id
  const isGenerating = chat.status === 'submitted' || chat.status === 'streaming'
  if (isLatestAssistant && isGenerating) return false
  return !!getMessageText(message)
}

function isStreaming(message: { id: string, role: string }) {
  const lastMessage = chat.messages[chat.messages.length - 1]
  return message.role === 'assistant' && lastMessage?.id === message.id
    && (chat.status === 'submitted' || chat.status === 'streaming')
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

async function scrollToBottom(smooth = false) {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: scrollContainer.value.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant'
    })
  }
}

watch(() => chat.status, (status) => {
  if (status === 'submitted' || status === 'ready') scrollToBottom(true)
})

function isAssistantThinking(message: { id: string, role: string }) {
  const lastMessage = chat.messages[chat.messages.length - 1]
  const isLatestAssistant = message.role === 'assistant' && lastMessage?.id === message.id
  const isGenerating = chat.status === 'submitted' || chat.status === 'streaming'
  return isLatestAssistant && (isGenerating || promptLoading.value)
}
</script>

<template>
  <div ref="scrollContainer" class="h-screen overflow-y-auto">
    <!-- Header -->
    <div class="sticky top-0 z-20 flex items-center justify-between px-4 py-1 border-b border-default/50 bg-opacity-0 backdrop-blur">
      <!-- Brand -->
      <div class="flex items-center gap-2">
        <img src="/favicon.svg" class="w-6 h-6" alt="logo">
        <p class="font-semibold text-sm hidden xs:block">Meizuno AI</p>
      </div>

      <!-- Right: MCP button + user dropdown -->
      <div class="flex items-center gap-1">
        <!-- MCP servers popover -->
        <UPopover :content="{ align: 'end' }">
          <UButton variant="ghost" color="neutral" size="sm" class="px-2">
            <!-- SVG MCP letters icon — color reflects overall status -->
            <svg width="35" height="20" viewBox="0 0 34 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <text
                x="1" y="14"
                font-family="ui-monospace, 'Courier New', monospace"
                font-size="18"
                font-weight="800"
                letter-spacing="0.5"
                :fill="mcpStatus === null ? '#94a3b8' : mcpStatus.connected ? '#22c55e' : '#ef4444'"
              >MCP</text>
            </svg>
          </UButton>

          <template #content>
            <div class="p-3 w-64">
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-semibold text-highlighted uppercase tracking-wider">MCP Servers</p>
                <UButton
                  icon="i-lucide-refresh-cw"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  :loading="mcpLoading"
                  @click="fetchMcpStatus"
                />
              </div>

              <!-- Per-server rows -->
              <div
                v-if="mcpStatus?.servers?.length"
                class="space-y-1"
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
                  <span v-else class="text-xs text-red-500 shrink-0">unreachable</span>
                </div>
              </div>

              <!-- Loading skeleton -->
              <div v-else-if="mcpStatus === null" class="space-y-1">
                <div v-for="i in 2" :key="i" class="flex items-center gap-2.5 px-2 py-2">
                  <USkeleton class="w-2 h-2 rounded-full shrink-0" />
                  <USkeleton class="h-3 flex-1 rounded" />
                  <USkeleton class="h-3 w-12 rounded" />
                </div>
              </div>

              <!-- No servers configured -->
              <p v-else class="text-xs text-muted text-center py-2">No servers configured</p>
            </div>
          </template>
        </UPopover>

        <!-- User dropdown -->
        <ClientOnly>
          <UDropdownMenu :items="userMenuItems" :ui="{ content: 'w-56' }">
            <UButton variant="ghost" color="neutral" size="sm" class="gap-1.5 px-2">
              <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="xs" />
              <span class="text-xs font-medium hidden sm:block max-w-28 truncate">{{ user?.name }}</span>
              <UIcon name="i-lucide-chevron-down" class="size-3 text-muted shrink-0" />
            </UButton>
          </UDropdownMenu>
          <template #fallback>
            <USkeleton class="h-9 w-14.5 rounded-lg" />
          </template>
        </ClientOnly>
      </div>
    </div>

      <div class="min-h-[calc(100vh-8rem)] pt-4">
        <div
          v-if="chat.messages.length === 0 && welcomeMessage"
          class="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center gap-6"
        >
          <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <img src="/favicon.svg" class="w-8 h-8" alt="bot icon">
          </div>
          <div class="text-center">
            <p v-if="botName" class="font-semibold text-base">{{ botName }}</p>
            <p class="text-sm text-muted mt-1">{{ welcomeMessage }}</p>
          </div>
          <div v-if="promptGroups.length" class="w-full grid gap-3" :class="promptGroups.length > 1 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' : 'max-w-md'">
            <div
              v-for="group in promptGroups"
              :key="group.server"
              class="rounded-xl border border-default bg-default/50 p-3"
            >
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5 px-1">{{ group.server }}</p>
              <div class="grid gap-1.5">
                <button
                  v-for="item in group.prompts"
                  :key="item.label"
                  class="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-elevated transition-colors cursor-pointer"
                  @click="useSuggestedPrompt(item)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <UChatMessages
          class="max-w-3xl mx-auto px-4"
          :messages="chat.messages"
          :status="chat.status"
          :user="{ ui: { actions: '!opacity-100 sm:!opacity-0 sm:group-hover/message:!opacity-100', content: 'rounded-3xl px-4 py-2' } }"
          :assistant="{ ui: { actions: '!opacity-100 sm:!opacity-0 sm:group-hover/message:!opacity-100', root: 'last:h-fit' } }"
        >
          <template #content="{ message }">
            <template
              v-for="(part, index) in message.parts"
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
              <UChatShimmer
                v-if="isAssistantThinking(message)"
                text="Thinking…"
                class="text-sm text-muted"
              />
              <UBadge
                v-else-if="message.role === 'assistant' && message.parts.some(p => isToolUIPart(p))"
                :label="MCP_DISPLAY_NAME"
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

      <div class="sticky bottom-0 z-20 px-6 pb-6 pt-3 bg-opacity-0">
        <div class="max-w-3xl mx-auto relative">
          <Transition name="usage">
            <div v-if="usage" class="absolute -top-6 right-1 flex items-center gap-3 text-xs text-muted">
              <span>↑ {{ usage.inputTokens?.toLocaleString() }}</span>
              <span>↓ {{ usage.outputTokens?.toLocaleString() }}</span>
              <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
            </div>
          </Transition>
          <ClientOnly>
            <ChatPrompt
              v-model="input"
              :status="chat.status"
              :error="chat.error"
              :disabled="promptLoading"
              :prompt-groups="promptGroups"
              :has-messages="chat.messages.length > 0"
              @submit="onSubmit"
              @stop="chat.stop()"
              @clear="chat.messages = []; usage = null"
              @prompt="useSuggestedPrompt($event)"
            />
            <template #fallback>
              <div class="rounded-2xl border border-default bg-default px-3 py-2 h-10" />
            </template>
          </ClientOnly>
        </div>
      </div>
  </div>
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
