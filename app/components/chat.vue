<script setup lang="ts">
import { isTextUIPart } from 'ai'
import { Chat } from '@ai-sdk/vue'

const { user, clear } = useUserSession()
const input = ref('')
const temporaryChat = ref(false)

const sidebarOpen = ref(true)
const windowWidth = ref(0)

onMounted(() => {
  windowWidth.value = window.innerWidth
  sidebarOpen.value = window.innerWidth >= 768
  window.addEventListener('resize', () => {
    windowWidth.value = window.innerWidth
    if (window.innerWidth < 768) sidebarOpen.value = false
  })
})

const usage = ref<{ inputTokens: number, outputTokens: number, totalTokens: number } | null>(null)

const PRICE_INPUT = 2.50
const PRICE_OUTPUT = 10.00

const estimatedCost = computed(() => {
  if (!usage.value) return null
  const cost = ((usage.value.inputTokens ?? 0) / 1_000_000) * PRICE_INPUT
    + ((usage.value.outputTokens ?? 0) / 1_000_000) * PRICE_OUTPUT
  return cost < 0.01 ? '< $0.01' : `$${cost.toFixed(4)}`
})

async function logout() {
  await clear()
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

        <div class="flex items-center gap-3 px-4 py-3">
          <UAvatar :src="user?.avatar" :alt="user?.name" size="sm" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ user?.name }}</p>
            <p class="text-xs text-muted truncate">{{ user?.email }}</p>
          </div>
          <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" @click="logout" />
        </div>
      </div>
    </Transition>

    <!-- Chat area -->
    <div class="flex flex-col flex-1 min-w-0">
      <div class="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
        <div class="flex items-center gap-3">
          <UButton
            :icon="sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="sidebarOpen = !sidebarOpen"
          />
          <p class="font-semibold">Meizuno AI Chat</p>
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
        <UChatMessages :messages="chat.messages" :status="chat.status">
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
        </UChatMessages>
      </div>

      <div class="p-4 shrink-0">
        <UChatPrompt v-model="input" :error="chat.error" @submit="onSubmit">
          <UChatPromptSubmit
            :status="chat.status"
            @stop="chat.stop()"
            @reload="chat.regenerate()"
          />
        </UChatPrompt>

        <Transition name="usage">
          <div v-if="usage" class="flex items-center gap-3 mt-2 px-1 text-xs text-muted">
            <span>↑ {{ usage.inputTokens?.toLocaleString() }} tokens</span>
            <span>↓ {{ usage.outputTokens?.toLocaleString() }} tokens</span>
            <span class="text-highlighted font-medium">{{ estimatedCost }}</span>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
