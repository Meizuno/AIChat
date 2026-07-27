<script setup lang="ts">
import type { ChatStatus, FileUIPart } from 'ai'

type PromptItem = { label: string, prompt?: string, route?: string }
type PromptGroup = { server: string, prompts: PromptItem[] }

const props = defineProps<{
  status: ChatStatus
  error?: Error
  disabled?: boolean
  promptGroups?: PromptGroup[]
}>()

const emit = defineEmits<{
  submit: [files: FileUIPart[]]
  stop: []
  prompt: [item: PromptItem]
}>()

const input = defineModel<string>({ default: '' })

const promptsOpen = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
// Attachments held as FileUIPart (data URL) — the same shape used for both
// the thumbnail preview and chat.sendMessage({ files }).
const attachments = ref<FileUIPart[]>([])

const isStreaming = computed(() => props.status === 'streaming' || props.status === 'submitted')

function selectPrompt(item: PromptItem) {
  promptsOpen.value = false
  emit('prompt', item)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onFilesSelected(event: Event) {
  const el = event.target as HTMLInputElement
  const images = Array.from(el.files ?? []).filter(file => file.type.startsWith('image/'))
  for (const file of images) {
    attachments.value.push({
      type: 'file',
      mediaType: file.type,
      filename: file.name,
      url: await readAsDataUrl(file)
    })
  }
  el.value = '' // allow re-picking the same file
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

function send() {
  if (input.value.trim() === '' && attachments.value.length === 0) return
  emit('submit', [...attachments.value])
  attachments.value = []
}

// UChatPrompt only emits @submit when the text is non-empty, so cover the
// image-only case (send button clicked with no text but attachments present).
function onSubmitClick() {
  if (props.status === 'ready' && input.value.trim() === '' && attachments.value.length) send()
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
    @submit="send"
  >
    <!-- Attachment previews above the textarea -->
    <template
      v-if="attachments.length"
      #header
    >
      <div class="flex flex-wrap gap-2 p-1">
        <div
          v-for="(att, i) in attachments"
          :key="i"
          class="relative"
        >
          <img
            :src="att.url"
            :alt="att.filename"
            class="size-16 rounded-lg object-cover border border-default"
          >
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="solid"
            size="xs"
            class="absolute -top-1.5 -right-1.5 rounded-full p-0.5"
            :aria-label="`Remove ${att.filename}`"
            @click="removeAttachment(i)"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center gap-1 w-full border-t border-default pt-2">
        <!-- Attach images -->
        <UButton
          icon="i-lucide-paperclip"
          variant="ghost"
          color="neutral"
          size="xs"
          :disabled="disabled || isStreaming"
          aria-label="Attach images"
          @click="fileInput?.click()"
        />

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
            :disabled="disabled || isStreaming"
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
          @click="onSubmitClick"
        />
      </div>
    </template>
  </UChatPrompt>

  <input
    ref="fileInput"
    type="file"
    accept="image/*"
    multiple
    class="hidden"
    @change="onFilesSelected"
  >
</template>

<style scoped>
/* iOS zooms the page when focusing an input whose font-size is < 16px.
   Keep the compact text on desktop (mouse), but use 16px on touch devices
   to suppress the zoom without disabling pinch-to-zoom. */
@media (pointer: coarse) {
  :deep(textarea) {
    font-size: 16px;
  }
}
</style>
