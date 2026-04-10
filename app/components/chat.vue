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
const sidebarOpen = ref(true)
const MCP_DISPLAY_NAME = 'Money Manager'

type McpStatus = { connected: boolean, toolCount: number, tools: string[] }
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

type AppConfig = { defaults: { welcomeMessage: string, botName: string }, suggestedPrompts: { label: string, prompt?: string, route?: string }[] }
const appConfig = useState<AppConfig | null>('app-config', () => null)

const welcomeMessage = computed(() => appConfig.value?.defaults.welcomeMessage ?? '')
const botName = computed(() => appConfig.value?.defaults.botName ?? '')
const suggestedPrompts = computed(() => appConfig.value?.suggestedPrompts ?? [])

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
      const text = typeof data.text === 'string'
        ? data.text
        : '```chart\n' + JSON.stringify(data) + '\n```'
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
  <div class="flex h-screen overflow-hidden">
    <USidebar v-model:open="sidebarOpen" collapsible="offcanvas" :ui="{ footer: 'sm:pb-6' }">
      <template #header>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <img src="/favicon.svg" class="w-6 h-6" alt="logo">
            <p class="font-semibold">Meizuno AI</p>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="sm"
            class="lg:hidden"
            @click="sidebarOpen = false"
          />
        </div>
      </template>

      <!-- MCP Servers -->
      <div class="px-2 py-2">
        <p class="text-xs font-medium text-muted uppercase tracking-wider mb-1">MCP Servers</p>
        <UTooltip
          :text="mcpStatus?.connected ? `${mcpStatus.toolCount} tool${mcpStatus.toolCount === 1 ? '' : 's'}: ${mcpStatus.tools.join(', ')}` : 'Money Manager server unreachable'"
          :delay-duration="200"
        >
          <div class="flex items-center gap-2 cursor-default rounded-md px-2 py-1.5 hover:bg-elevated">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="mcpStatus === null ? 'bg-muted animate-pulse' : mcpStatus.connected ? 'bg-green-500' : 'bg-red-500'"
            />
            <span class="text-sm truncate flex-1">
              <template v-if="mcpStatus === null">Checking…</template>
              <template v-else>Money Manager</template>
            </span>
            <UButton
              icon="i-lucide-refresh-cw"
              variant="ghost"
              color="neutral"
              size="xs"
              class="shrink-0"
              :loading="mcpLoading"
              @click="fetchMcpStatus"
            />
          </div>
        </UTooltip>
      </div>

      <template #footer>
        <div class="w-full flex flex-col gap-3">
          <!-- User -->
          <ClientOnly>
            <div class="flex items-center gap-3">
              <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="sm" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ user?.name }}</p>
                <p class="text-xs text-muted truncate">{{ user?.email }}</p>
              </div>
              <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" @click="handleLogout" />
            </div>
            <template #fallback>
              <div class="flex items-center gap-3">
                <USkeleton class="size-7 rounded-full shrink-0" />
                <div class="flex-1 min-w-0 space-y-1.5">
                  <USkeleton class="h-3 w-24 rounded" />
                  <USkeleton class="h-3 w-32 rounded" />
                </div>
              </div>
            </template>
          </ClientOnly>
        </div>
      </template>
    </USidebar>

    <!-- Main content -->
    <div class="flex flex-col flex-1 h-screen min-w-0 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center px-4 py-3 shrink-0">
        <UButton
          :icon="sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="sidebarOpen = !sidebarOpen"
        />
      </div>

      <div ref="scrollContainer" class="flex-1 overflow-y-auto pt-4">
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
          <div v-if="suggestedPrompts.length" class="flex flex-wrap justify-center gap-2">
            <button
              v-for="item in suggestedPrompts"
              :key="item.label"
              class="px-4 py-2 rounded-full border border-default text-sm hover:bg-elevated transition-colors cursor-pointer"
              @click="useSuggestedPrompt(item)"
            >
              {{ item.label }}
            </button>
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

      <div class="p-6 shrink-0">
        <div class="max-w-3xl mx-auto relative">
          <Transition name="usage">
            <div v-if="usage" class="absolute -top-6 right-1 flex items-center gap-3 text-xs text-muted">
              <span>↑ {{ usage.inputTokens?.toLocaleString() }}</span>
              <span>↓ {{ usage.outputTokens?.toLocaleString() }}</span>
              <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
            </div>
          </Transition>
          <div
            v-if="suggestedPrompts.length && chat.status === 'ready' && chat.messages.length > 0"
            class="flex gap-2 mb-3 overflow-x-auto scrollbar-none"
          >
            <template v-if="promptLoading">
              <USkeleton
                v-for="item in suggestedPrompts"
                :key="item.label"
                class="h-7 rounded-full shrink-0"
                :style="{ width: `${item.label.length * 7 + 24}px` }"
              />
            </template>
            <template v-else>
              <button
                v-for="item in suggestedPrompts"
                :key="item.label"
                class="px-3 py-1.5 rounded-full border border-default text-xs hover:bg-elevated transition-colors cursor-pointer shrink-0"
                @click="useSuggestedPrompt(item)"
              >
                {{ item.label }}
              </button>
            </template>
          </div>
          <ClientOnly>
            <ChatPrompt
              v-model="input"
              :status="chat.status"
              :error="chat.error"
              :disabled="promptLoading"
              @submit="onSubmit"
              @stop="chat.stop()"
            />
            <template #fallback>
              <div class="rounded-2xl border border-default bg-default px-3 py-2 h-10" />
            </template>
          </ClientOnly>
        </div>
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
