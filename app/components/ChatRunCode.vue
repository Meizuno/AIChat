<script setup lang="ts">
import type { ToolUIPart } from 'ai'

// Renders a `run_code` system-tool call in the chat: a collapsible card (Nuxt
// UI UCollapsible) with the executed code (syntax-highlighted via MDC) and the
// sandbox's output, plus a live status. The tool's input/output shapes come
// from server/services/system-tools.ts.
const props = defineProps<{ part: ToolUIPart }>()

// State-specific fields (input/output/errorText) live on different members of
// the ToolUIPart union; read them loosely rather than narrow every branch.
const input = computed(() => ((props.part as { input?: { language?: string, source?: string } }).input) ?? {})
const language = computed(() => input.value.language || 'python')
const source = computed(() => input.value.source || '')
const codeMarkdown = computed(() => `\`\`\`${language.value}\n${source.value}\n\`\`\``)

const output = computed(() => {
  const value = (props.part as { output?: unknown }).output
  return typeof value === 'string' ? value : ''
})
const errorText = computed(() => (props.part as { errorText?: string }).errorText ?? '')

const running = computed(() => props.part.state === 'input-streaming' || props.part.state === 'input-available')
const errored = computed(() => props.part.state === 'output-error')
const hasOutput = computed(() => errored.value || output.value.length > 0)
</script>

<template>
  <UCollapsible
    default-open
    :unmount-on-hide="false"
    class="my-3 overflow-hidden rounded-xl border border-default bg-default shadow-sm"
  >
    <template #default="{ open }">
      <!-- CollapsibleTrigger renders as-child, so this button toggles the card
           and gets aria-expanded / keyboard handling from Nuxt UI. -->
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-elevated"
      >
        <UIcon name="i-lucide-terminal" class="size-4 shrink-0 text-dimmed" />
        <span class="text-default">Ran {{ language }}</span>

        <span class="ml-auto flex items-center gap-1.5">
          <template v-if="running">
            <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin text-dimmed" />
            <span>running…</span>
          </template>
          <template v-else-if="errored">
            <UIcon name="i-lucide-circle-x" class="size-3.5 text-red-500" />
            <span class="text-red-500">error</span>
          </template>
          <template v-else>
            <UIcon name="i-lucide-circle-check" class="size-3.5 text-emerald-500" />
            <span>done</span>
          </template>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 shrink-0 text-dimmed transition-transform duration-200"
            :class="open ? 'rotate-180' : ''"
          />
        </span>
      </button>
    </template>

    <template #content>
      <MDC
        :value="codeMarkdown"
        class="border-t border-default px-3 py-1 text-sm *:first:mt-2 *:last:mb-2"
      />

      <div v-if="hasOutput" class="border-t border-default bg-elevated/40">
        <div class="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
          Output
        </div>
        <pre
          :class="[
            errored ? 'text-red-600 dark:text-red-400' : 'text-muted',
            'max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word px-3 pb-3 pt-1 font-mono text-xs'
          ]"
        >{{ errored ? errorText : output }}</pre>
      </div>
    </template>
  </UCollapsible>
</template>
