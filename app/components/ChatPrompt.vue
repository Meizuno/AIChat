<script setup lang="ts">
const props = defineProps<{
  status: "idle" | "submitted" | "streaming" | "error" | "ready";
  error?: Error;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  stop: [];
}>();

const input = defineModel<string>({ default: "" });

const isStreaming = computed(
  () => props.status === "streaming" || props.status === "submitted",
);
const hasText = computed(() => input.value.trim().length > 0);
const chatInput = useTemplateRef("chatInput");
const charsPerLine = ref(0);

onMounted(() => {
  const el = chatInput.value?.textareaRef;
  if (!el) return;
  const style = getComputedStyle(el);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  const charWidth = ctx.measureText("m").width;
  const paddingLeft = parseInt(style.paddingLeft);
  const paddingRight = parseInt(style.paddingRight);
  const contentWidth = el.clientWidth - paddingLeft - paddingRight;
  charsPerLine.value = Math.floor(contentWidth / charWidth);
});

const isExpanded = computed(() => {
  if (!charsPerLine.value) return false;
  const lines = input.value.split("\n");
  return lines.some(line => line.length > charsPerLine.value) || lines.length > 1;
});

function handleSubmit() {
  if (props.disabled) return;
  if (isStreaming.value) {
    emit("stop");
  } else if (hasText.value) {
    emit("submit");
  }
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
    } catch {
      /* ignore */
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
    class="rounded-2xl border border-default bg-default transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50"
    :class="
      isExpanded ? 'flex flex-col gap-2 p-3' : 'flex items-end gap-2 px-3 py-1.5'
    "
    @submit.prevent="handleSubmit"
  >
    <UTextarea
      ref="chatInput"
      v-model="input"
      :rows="1"
      autoresize
      variant="none"
      class="flex-1 w-full"
    />
    <div :class="isExpanded ? 'flex justify-end' : 'shrink-0'">
      <Transition name="fade">
        <span v-if="isStreaming" class="shrink-0 pb-0.5">
          <UButton
            icon="i-lucide-square"
            color="primary"
            variant="solid"
            size="sm"
            class="rounded-full"
            @click="emit('stop')"
          />
        </span>
        <span v-else-if="hasText && !props.disabled" class="shrink-0 pb-0.5">
          <UButton
            icon="i-lucide-arrow-up"
            color="primary"
            variant="solid"
            size="sm"
            class="rounded-full"
            type="submit"
          />
        </span>
        <span v-else class="shrink-0 pb-0.5">
          <UButton
            icon="i-lucide-mic"
            color="neutral"
            variant="ghost"
            size="sm"
            class="rounded-full"
            :disabled="props.disabled"
            @click="toggleRecording"
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

.textarea-autoresize {
  field-sizing: content;
  min-height: 28px;
  max-height: 192px;
}
</style>
