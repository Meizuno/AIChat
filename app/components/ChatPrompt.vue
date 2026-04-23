<script setup lang="ts">
type PromptItem = { label: string; prompt?: string; route?: string };
type PromptGroup = { server: string; prompts: PromptItem[] };

const props = defineProps<{
  status: "idle" | "submitted" | "streaming" | "error" | "ready";
  error?: Error;
  disabled?: boolean;
  promptGroups?: PromptGroup[];
}>();

const emit = defineEmits<{
  submit: [];
  stop: [];
  prompt: [item: PromptItem];
}>();

const input = defineModel<string>({ default: "" });

const isStreaming = computed(
  () => props.status === "streaming" || props.status === "submitted",
);
const hasText = computed(() => input.value.trim().length > 0);

const chatInput = useTemplateRef<any>("chatInput");

function handleSubmit() {
  if (props.disabled) return;
  if (isStreaming.value) {
    emit("stop");
  } else if (hasText.value) {
    emit("submit");
  }
}

const promptsOpen = ref(false);

function selectPrompt(item: PromptItem) {
  promptsOpen.value = false;
  emit("prompt", item);
}

// Recording
const isRecording = ref(false);
const isTranscribing = ref(false);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

async function toggleRecording() {
  if (isRecording.value) {
    mediaRecorder?.stop();
    isRecording.value = false;
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    isTranscribing.value = true;
    try {
      const formData = new FormData();
      formData.append(
        "audio",
        new Blob(audioChunks, { type: "audio/webm" }),
        "audio.webm",
      );
      const result = await $fetch<{ text: string }>("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      input.value = result.text;
    } catch (err) {
      console.warn('[Transcribe]', err)
    } finally {
      isTranscribing.value = false;
    }
  };
  mediaRecorder.start();
  isRecording.value = true;
}
</script>

<template>
  <!-- Recording / transcribing overlay -->
  <Transition name="slide">
    <div
      v-if="isRecording || isTranscribing"
      class="flex items-center gap-3 rounded-2xl border border-default bg-default px-4 py-3"
    >
      <div class="flex items-center gap-1.5 flex-1">
        <template v-if="isRecording">
          <span
            class="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse"
          />
          <span class="text-sm text-muted">Recording…</span>
          <div class="flex items-end gap-0.5 ml-1">
            <span
              v-for="i in 5"
              :key="i"
              class="w-0.5 rounded-full bg-red-400 animate-pulse"
              :style="{
                height: `${6 + (i % 3) * 5}px`,
                animationDelay: `${i * 0.12}s`,
              }"
            />
          </div>
        </template>
        <template v-else>
          <UIcon
            name="i-lucide-loader-2"
            class="h-4 w-4 shrink-0 animate-spin text-primary"
          />
          <span class="text-sm text-muted">Transcribing…</span>
        </template>
      </div>
      <UButton
        v-if="isRecording"
        icon="i-lucide-square"
        color="error"
        variant="solid"
        size="sm"
        class="shrink-0 rounded-full"
        @click="toggleRecording"
      />
    </div>
  </Transition>

  <!-- Input form -->
  <form
    v-if="!isRecording && !isTranscribing"
    class="rounded-2xl border border-accented bg-muted flex flex-col transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50"
    @submit.prevent="handleSubmit"
  >
    <!-- Textarea -->
    <UTextarea
      ref="chatInput"
      v-model="input"
      placeholder="Message…"
      :rows="1"
      :maxrows="8"
      autoresize
      variant="none"
      class="flex-1 w-full px-1 pt-1"
    />

    <!-- Divider -->
    <div class="mx-2 border-t border-accented" />

    <!-- Action bar -->
    <div class="flex items-center gap-1 px-2 pb-2 pt-1.5">
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
            <div v-for="group in promptGroups" :key="group.server">
              <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {{ group.server }}
              </p>
              <div class="space-y-0.5">
                <button
                  v-for="item in group.prompts"
                  :key="item.label"
                  class="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-sm text-left hover:bg-elevated transition-colors cursor-pointer"
                  @click="selectPrompt(item)"
                >
                  <UIcon
                    :name="item.route ? 'i-lucide-zap' : 'i-lucide-message-circle'"
                    class="size-3.5 shrink-0 text-muted"
                  />
                  <span class="truncate">{{ item.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>
      </UPopover>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Mic -->
      <UButton
        icon="i-lucide-mic"
        color="neutral"
        variant="ghost"
        size="xs"
        class="rounded-full"
        :disabled="disabled || isStreaming"
        @click="toggleRecording"
      />

      <!-- Send / Stop -->
      <Transition name="fade" mode="out-in">
        <span v-if="isStreaming" key="stop">
          <UButton
            icon="i-lucide-square"
            color="primary"
            variant="solid"
            size="xs"
            class="rounded-full"
            @click="emit('stop')"
          />
        </span>
        <span v-else key="send">
          <UButton
            icon="i-lucide-arrow-up"
            color="primary"
            :variant="hasText && !disabled ? 'solid' : 'ghost'"
            size="xs"
            class="rounded-full"
            type="submit"
            :disabled="!hasText || disabled"
          />
        </span>
      </Transition>
    </div>
  </form>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
