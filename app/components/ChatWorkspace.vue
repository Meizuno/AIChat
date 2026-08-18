<script setup lang="ts">
import { isTextUIPart, isToolUIPart, isFileUIPart } from 'ai'
import type { FileUIPart } from 'ai'
import type { PromptItem } from '#shared/types/prompt'
import { BOT_NAME, WELCOME_MESSAGE } from '~/constants'

// The chat panel: navbar (current chat title + rename/delete), the message
// stream (or welcome screen), and the prompt bar. Conversation state is shared
// via useConversations so the sidebar stays in sync; presentation-only concerns
// (scroll, copy, pull-to-refresh, suggested prompts) stay local here.
const {
  chat,
  input,
  onSubmit,
  activeChatId,
  activeChat,
  currentTitle,
  currentChatMenu,
  editingId,
  editingTitle,
  submitRename,
  onRenameBlur,
  usage,
  estimatedCost
} = useConversations()

function normalizeMarkdownForMdc(value: string) {
  const fences = (value.match(/^```/gm) || []).length
  if (fences % 2 !== 0) return value + '\n```'
  return value
}

// Per-user starter prompts (managed in Settings). Shown as welcome-screen chips
// and, grouped, in the prompt picker.
const { suggestedPrompts, ensureLoaded } = useSettings()
onMounted(ensureLoaded)

const flatPrompts = computed(() => suggestedPrompts.value)
const promptGroups = computed(() =>
  suggestedPrompts.value.length ? [{ server: 'Suggestions', prompts: suggestedPrompts.value }] : []
)

const promptLoading = ref(false)
const copiedMessageId = ref<string | null>(null)

const scrollContainer = ref<HTMLElement | null>(null)

function scrollAfterRender() {
  if (!scrollContainer.value) return
  const observer = new MutationObserver(() => {
    scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight, behavior: 'smooth' })
  })
  observer.observe(scrollContainer.value, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 2000)
}

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

// Pull down past the threshold = clear the chat (full-page reload).
// Disabled while a stream is in flight so a long completion can't
// be interrupted by an accidental pull.
const {
  distance: pullDistance,
  pulling: isPulling,
  ready: pullReady
} = usePullToRefresh(scrollContainer, {
  canPull: () => chat.value.status !== 'streaming' && chat.value.status !== 'submitted'
})
</script>

<template>
  <UDashboardPanel>
    <!-- Page header: current chat name + rename/delete (+ sidebar toggle on mobile) -->
    <UDashboardNavbar :ui="{ title: 'text-sm' }">
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
          v-if="chat.messages.length === 0"
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
            <p class="font-semibold text-base">
              {{ BOT_NAME }}
            </p>
            <p class="text-sm text-muted mt-1">
              {{ WELCOME_MESSAGE }}
            </p>
          </div>
          <div
            v-if="flatPrompts.length"
            class="flex flex-wrap justify-center gap-2 max-w-2xl"
          >
            <button
              v-for="(item, i) in flatPrompts"
              :key="`${i}:${item.label}`"
              class="group flex items-center gap-2 rounded-xl border border-default bg-default/50 p-1 pr-3 text-left hover:bg-elevated hover:border-primary/50 transition-all cursor-pointer"
              @click="useSuggestedPrompt(item)"
            >
              <div class="size-6 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-message-circle"
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
</template>
