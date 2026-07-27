<script setup lang="ts">
import type { ChatStatus } from 'ai'

type PromptItem = { label: string, prompt?: string, route?: string }
type PromptGroup = { server: string, prompts: PromptItem[] }

defineProps<{
  status: ChatStatus
  error?: Error
  disabled?: boolean
  promptGroups?: PromptGroup[]
}>()

const emit = defineEmits<{
  submit: []
  stop: []
  prompt: [item: PromptItem]
}>()

const input = defineModel<string>({ default: '' })

const promptsOpen = ref(false)

function selectPrompt(item: PromptItem) {
  promptsOpen.value = false
  emit('prompt', item)
}
</script>

<template>
  <UChatPrompt
    v-model="input"
    placeholder="Message…"
    :error="error"
    :disabled="disabled"
    :maxrows="8"
    variant="subtle"
    size="sm"
    @submit="emit('submit')"
  >
    <template #footer>
      <div class="flex items-center gap-1 w-full border-t border-default pt-2">
        <!-- Prompt groups picker -->
        <UPopover
          v-if="promptGroups?.length"
          v-model:open="promptsOpen"
          :content="{ align: 'start', sideOffset: 8 }"
        >
          <UButton
            icon="i-lucide-sparkles"
            variant="ghost"
            color="neutral"
            size="xs"
            :disabled="disabled || status === 'streaming' || status === 'submitted'"
          />
          <template #content>
            <div class="w-64 p-2 space-y-3">
              <div
                v-for="group in promptGroups"
                :key="group.server"
              >
                <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {{ group.server }}
                </p>
                <div class="space-y-0.5">
                  <UButton
                    v-for="item in group.prompts"
                    :key="item.label"
                    :icon="item.route ? 'i-lucide-zap' : 'i-lucide-message-circle'"
                    :label="item.label"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    block
                    class="justify-start"
                    @click="selectPrompt(item)"
                  />
                </div>
              </div>
            </div>
          </template>
        </UPopover>

        <div class="flex-1" />

        <!-- Send / Stop — status-driven, handled by the framework -->
        <UChatPromptSubmit
          :status="status"
          color="primary"
          size="xs"
          @stop="emit('stop')"
        />
      </div>
    </template>
  </UChatPrompt>
</template>
