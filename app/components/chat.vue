<script setup lang="ts">
import { isTextUIPart, isToolUIPart } from 'ai'
import { Chat } from '@ai-sdk/vue'

const { user, logout } = useAuth()
const input = ref('')
const temporaryChat = ref(false)

const sidebarOpen = ref(true)
const windowWidth = ref(0)
const MCP_DISPLAY_NAME = 'Money Manager'

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
  const interval = setInterval(fetchMcpStatus, 30_000)
  onUnmounted(() => clearInterval(interval))
})

onMounted(() => {
  windowWidth.value = window.innerWidth
  sidebarOpen.value = window.innerWidth >= 768
  window.addEventListener('resize', () => {
    windowWidth.value = window.innerWidth
    if (window.innerWidth < 768) sidebarOpen.value = false
  })
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
  onData(part) {
    if (part.type === 'data-usage') {
      usage.value = part.data as { inputTokens: number, outputTokens: number, totalTokens: number }
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
  return message.parts
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

function isAssistantThinking(message: { id: string, role: string }) {
  const lastMessage = chat.messages[chat.messages.length - 1]
  const isLatestAssistant = message.role === 'assistant' && lastMessage?.id === message.id
  const isGenerating = chat.status === 'submitted' || chat.status === 'streaming'
  return isLatestAssistant && isGenerating
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- Mobile overlay -->
    <Transition name="overlay">
      <div
        v-if="sidebarOpen && windowWidth < 768"
        class="fixed inset-0 z-20 bg-black/50"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Sidebar -->
    <Transition name="sidebar">
      <div
        v-if="sidebarOpen"
        class="flex flex-col w-64 border-r border-default shrink-0 z-30 bg-background"
        :class="windowWidth < 768 ? 'fixed inset-y-0 left-0' : 'relative'"
      >
        <div class="flex items-center gap-2 px-4 py-3 border-b border-default">
          <img src="/favicon.svg" class="w-6 h-6" alt="logo">
          <p class="font-semibold">Meizuno AI</p>
        </div>

        <div class="flex-1" />

        <!-- MCP Status -->
        <div class="px-4 py-3 border-t border-default">
          <UTooltip
            :text="mcpStatus?.connected ? `${mcpStatus.toolCount} tool${mcpStatus.toolCount === 1 ? '' : 's'}: ${mcpStatus.tools.join(', ')}` : 'Money Manager server unreachable'"
            :delay-duration="200"
          >
            <div class="flex items-center gap-2 cursor-default">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="mcpStatus === null ? 'bg-muted animate-pulse' : mcpStatus.connected ? 'bg-green-500' : 'bg-red-500'"
              />
              <span class="text-xs text-muted">
                <template v-if="mcpStatus === null">Checking Money Manager…</template>
                <template v-else-if="mcpStatus.connected">Money Manager</template>
                <template v-else>Money Manager disconnected</template>
              </span>
              <UButton
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="neutral"
                size="xs"
                class="ml-auto"
                :loading="mcpStatus === null"
                @click="fetchMcpStatus"
              />
            </div>
          </UTooltip>
        </div>

        <div class="flex items-center gap-3 px-4 py-3 border-t border-default">
          <UAvatar :src="user?.avatar" :alt="user?.name" size="sm" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ user?.name }}</p>
            <p class="text-xs text-muted truncate">{{ user?.email }}</p>
          </div>
          <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" @click="handleLogout" />
        </div>
      </div>
    </Transition>

    <!-- Chat area -->
    <div class="flex flex-col flex-1 min-w-0">
      <div class="flex items-center justify-between px-4 py-3 shrink-0">
        <div class="flex items-center gap-3">
          <UButton
            :icon="sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="sidebarOpen = !sidebarOpen"
          />
        </div>
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
          :user="{ ui: { actions: copiedMessageId ? '!opacity-100' : '' } }"
          :assistant="{ ui: { actions: '!opacity-100', root: 'last:h-fit' } }"
        >
          <template #content="{ message }">
            <template
              v-for="(part, index) in message.parts"
              :key="`${message.id}-${part.type}-${index}`"
            >
              <MDC
                v-if="isTextUIPart(part)"
                :value="part.text"
                :cache-key="`${message.id}-${index}`"
                class="*:first:mt-0 *:last:mb-0"
              />
            </template>
          </template>
          <template #actions="{ message }">
            <div class="flex items-center gap-2">
              <div
                v-if="isAssistantThinking(message)"
                class="flex items-center gap-1 text-xs text-muted"
              >
                <UIcon name="i-lucide-loader-circle" class="w-3.5 h-3.5 animate-spin" />
                <span>AI is thinking…</span>
              </div>
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

      <div class="p-4 shrink-0">
        <div class="max-w-3xl mx-auto relative">
          <Transition name="usage">
            <div v-if="usage" class="absolute -top-6 right-1 flex items-center gap-3 text-xs text-muted">
              <span>↑ {{ usage.inputTokens?.toLocaleString() }}</span>
              <span>↓ {{ usage.outputTokens?.toLocaleString() }}</span>
              <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
            </div>
          </Transition>
          <UChatPrompt v-model="input" :error="chat.error" @submit="onSubmit">
            <UButton
              :icon="chat.status === 'streaming' || chat.status === 'submitted' ? 'i-lucide-square' : input.trim() ? 'i-lucide-arrow-up' : isRecording ? 'i-lucide-square' : 'i-lucide-mic'"
              :color="isRecording ? 'error' : 'primary'"
              variant="solid"
              size="sm"
              :loading="isTranscribing"
              :class="['rounded-full', isRecording ? 'animate-pulse' : '']"
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

.sidebar-enter-active,
.sidebar-leave-active {
  transition: all 0.25s ease;
}
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.25s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
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
