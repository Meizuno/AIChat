<script setup lang="ts">
import { isTextUIPart, isToolUIPart, DefaultChatTransport } from 'ai'
import { Chat } from '@ai-sdk/vue'

function normalizeMarkdownForMdc(value: string) {
  // Close any unclosed fenced code block so MDC renders it during streaming
  const fences = (value.match(/^```/gm) || []).length
  if (fences % 2 !== 0) return value + '\n```'
  return value
}

const { user, logout } = useAuth()
const input = ref('')
const temporaryChat = ref(false)
const sidebarOpen = ref(true)
const MCP_DISPLAY_NAME = 'Money Manager'

type Conversation = { id: string, title: string | null, updatedAt: string }
const conversations = ref<Conversation[]>([])
const currentConversationId = ref<string | null>(null)

const conversationsLoading = ref(true)

const fetchConversations = async () => {
  try {
    const data = await $fetch<{ conversations: Conversation[] }>('/api/conversations')
    conversations.value = data.conversations
  }
  catch { /* ignore */ }
  finally { conversationsLoading.value = false }
}

const loadConversation = async (id: string) => {
  try {
    const data = await $fetch<{
      conversation: {
        inputTokens: number, outputTokens: number, costUsd: number,
        messages: { id: string, role: string, content: string }[]
      }
    }>(`/api/conversations/${id}`)
    currentConversationId.value = id
    chat.messages = data.conversation.messages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
      metadata: undefined
    }))
    usage.value = {
      inputTokens: data.conversation.inputTokens,
      outputTokens: data.conversation.outputTokens,
      totalTokens: data.conversation.inputTokens + data.conversation.outputTokens
    }
  }
  catch { /* ignore */ }
}


const startNewConversation = () => {
  currentConversationId.value = null
  chat.messages = []
  usage.value = null
}

const closeSidebarOnMobile = () => {
  if (import.meta.client && window.innerWidth < 1024) sidebarOpen.value = false
}

type McpStatus = { connected: boolean, toolCount: number, tools: string[] }
const mcpStatus = ref<McpStatus | null>(null)

const fetchMcpStatus = async () => {
  try {
    mcpStatus.value = await $fetch<McpStatus>('/api/mcp-status')
  }
  catch {
    mcpStatus.value = { connected: false, toolCount: 0, tools: [] }
  }
}

onMounted(() => {
  fetchMcpStatus()
  fetchConversations()
  const interval = setInterval(fetchMcpStatus, 30_000)
  onUnmounted(() => clearInterval(interval))
})

const usage = ref<{ inputTokens: number, outputTokens: number, totalTokens: number } | null>(null)
const copiedMessageId = ref<string | null>(null)
const isRecording = ref(false)
const isTranscribing = ref(false)
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []

async function toggleRecording() {
  if (isRecording.value) {
    mediaRecorder?.stop()
    isRecording.value = false
    return
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  audioChunks = []
  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop())
    isTranscribing.value = true
    try {
      const formData = new FormData()
      formData.append('audio', new Blob(audioChunks, { type: 'audio/webm' }), 'audio.webm')
      const result = await $fetch<{ text: string }>('/api/transcribe', { method: 'POST', body: formData })
      input.value = result.text
    }
    catch { /* ignore */ }
    finally { isTranscribing.value = false }
  }
  mediaRecorder.start()
  isRecording.value = true
}

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
  transport: new DefaultChatTransport({
    body: () => ({ temporary: temporaryChat.value, conversationId: currentConversationId.value })
  }),
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
    if (part.type === 'data-conversationId') {
      const id = part.data as string
      if (!currentConversationId.value) {
        currentConversationId.value = id
        fetchConversations()
      }
    }
  },
  onError(error) {
    console.error(error)
  }
})

watch(temporaryChat, (enabled) => {
  if (enabled) {
    chat.messages = []
    usage.value = null
  }
})

function onSubmit() {
  chat.sendMessage({ text: input.value })
  input.value = ''
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

function isAssistantThinking(message: { id: string, role: string }) {
  const lastMessage = chat.messages[chat.messages.length - 1]
  const isLatestAssistant = message.role === 'assistant' && lastMessage?.id === message.id
  const isGenerating = chat.status === 'submitted' || chat.status === 'streaming'
  return isLatestAssistant && isGenerating
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <USidebar v-model:open="sidebarOpen" collapsible="offcanvas" :ui="{ inner: 'pb-4' }">
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

      <!-- Conversations -->
      <div class="flex flex-col flex-1 overflow-hidden">
        <div class="flex items-center justify-between px-2 py-2">
          <p class="text-xs font-medium text-muted uppercase tracking-wider">Conversations</p>
          <UButton icon="i-lucide-square-pen" variant="ghost" color="neutral" size="xs" @click="startNewConversation" />
        </div>
        <div class="flex-1 overflow-y-auto space-y-0.5">
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="w-full text-left px-2 py-2 rounded-md text-sm truncate transition-colors hover:bg-elevated"
            :class="currentConversationId === conv.id ? 'bg-elevated font-medium' : 'text-muted'"
            @click="loadConversation(conv.id); closeSidebarOnMobile()"
          >
            {{ conv.title || 'New conversation' }}
          </button>
          <div v-if="conversationsLoading" class="flex flex-1 items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin text-muted" />
          </div>
          <p v-else-if="conversations.length === 0" class="px-2 py-2 text-xs text-muted">No conversations yet</p>
        </div>
      </div>

      <template #footer>
        <div class="w-full flex flex-col gap-3">
          <!-- MCP Servers -->
          <div>
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
                  :loading="mcpStatus === null"
                  @click="fetchMcpStatus"
                />
              </div>
            </UTooltip>
          </div>

          <USeparator />

          <!-- User -->
          <div class="flex items-center gap-3">
            <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="sm" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ user?.name }}</p>
              <p class="text-xs text-muted truncate">{{ user?.email }}</p>
            </div>
            <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" @click="handleLogout" />
          </div>
        </div>
      </template>
    </USidebar>

    <!-- Main content -->
    <div class="flex flex-col flex-1 h-screen min-w-0 overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 shrink-0">
          <UButton
            :icon="sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="sidebarOpen = !sidebarOpen"
          />
          <div class="flex items-center gap-2">
            <UTooltip text="Messages won't be saved and history will be cleared when you turn this off">
              <UIcon name="i-lucide-info" class="w-4 h-4 text-muted" />
            </UTooltip>
            <span class="text-sm text-muted">Temporary chat</span>
            <USwitch v-model="temporaryChat" />
          </div>
        </div>

        <Transition name="banner">
          <div v-if="temporaryChat" class="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm shrink-0">
            <UIcon name="i-lucide-clock" class="w-4 h-4 shrink-0" />
            This is a temporary chat. Messages will not be saved.
          </div>
        </Transition>

        <div class="flex-1 overflow-y-auto pt-4">
          <UChatMessages
            class="max-w-3xl mx-auto px-4"
            :messages="chat.messages"
            :status="chat.status"
            :user="{ ui: { actions: copiedMessageId ? '!opacity-100' : '', content: 'rounded-full px-4 py-2' } }"
            :assistant="{ ui: { actions: '!opacity-100', root: 'last:h-fit' } }"
          >
            <template #content="{ message }">
              <template
                v-for="(part, index) in message.parts"
                :key="`${message.id}-${part.type}-${index}`"
              >
                <MDC
                  v-if="isTextUIPart(part)"
                  :value="normalizeMarkdownForMdc(part.text)"
                  :cache-key="isStreaming(message) ? `${message.id}-${index}-${part.text.length}` : `${message.id}-${index}`"
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

        <div class="p-8 shrink-0">
          <div class="max-w-3xl mx-auto relative">
            <Transition name="usage">
              <div v-if="usage" class="absolute -top-6 right-1 flex items-center gap-3 text-xs text-muted">
                <span>↑ {{ usage.inputTokens?.toLocaleString() }}</span>
                <span>↓ {{ usage.outputTokens?.toLocaleString() }}</span>
                <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
              </div>
            </Transition>
            <!-- Recording / transcribing state -->
            <Transition name="recording">
              <div
                v-if="isRecording || isTranscribing"
                class="flex items-center gap-3 rounded-full border border-default bg-default px-4 py-2.5"
              >
                <div class="flex items-center gap-1.5 flex-1">
                  <template v-if="isRecording">
                    <span class="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span class="text-sm text-muted">Recording…</span>
                    <div class="flex items-end gap-0.5 ml-1">
                      <span v-for="i in 4" :key="i" class="w-0.5 rounded-full bg-red-400 animate-pulse" :style="{ height: `${8 + (i % 3) * 4}px`, animationDelay: `${i * 0.15}s` }" />
                    </div>
                  </template>
                  <template v-else>
                    <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin text-primary" />
                    <span class="text-sm text-muted">Transcribing…</span>
                  </template>
                </div>
                <UButton
                  v-if="isRecording"
                  icon="i-lucide-square"
                  color="error"
                  variant="solid"
                  size="sm"
                  class="rounded-full"
                  @click="toggleRecording"
                />
              </div>
            </Transition>

            <UChatPrompt v-if="!isRecording && !isTranscribing" v-model="input" :error="chat.error" :ui="{ root: 'bg-elevated/50 rounded-4xl [&>div]:items-center' }" @submit="onSubmit">
              <UButton
                :icon="chat.status === 'streaming' || chat.status === 'submitted' ? 'i-lucide-square' : input.trim() ? 'i-lucide-arrow-up' : 'i-lucide-mic'"
                :color="'primary'"
                variant="solid"
                size="sm"
                class="rounded-full"
                @click="chat.status === 'streaming' || chat.status === 'submitted' ? chat.stop() : input.trim() ? onSubmit() : toggleRecording()"
              />
            </UChatPrompt>
          </div>
        </div>
    </div>
  </div>
</template>


<style scoped>
button {
  cursor: pointer;
}

.recording-enter-active,
.recording-leave-active {
  transition: all 0.2s ease;
}
.recording-enter-from,
.recording-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.banner-enter-active,
.banner-leave-active {
  transition: all 0.2s ease;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.usage-enter-active {
  transition: all 0.3s ease;
}
.usage-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
</style>
