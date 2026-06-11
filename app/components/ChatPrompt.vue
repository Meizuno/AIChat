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
</script>

<template>
  <!-- Input form -->
  <form
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
