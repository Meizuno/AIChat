<script setup lang="ts">
import type { ToolUIPart } from 'ai'

// Renders a `run_code` system-tool call in the chat: a collapsible card
// (Nuxt UI UCollapsible) with a bespoke editor panel for the executed code and
// a terminal-style console panel for the sandbox's output, plus a colour-coded
// live status. The tool's input/output shapes come from
// server/services/system-tools.ts.
const props = defineProps<{ part: ToolUIPart }>()

// State-specific fields (input/output/errorText) live on different members of
// the ToolUIPart union; read them loosely rather than narrow every branch.
const input = computed(() => ((props.part as { input?: { language?: string, source?: string } }).input) ?? {})
const language = computed(() => input.value.language || 'python')
const languageLabel = computed(() => language.value.charAt(0).toUpperCase() + language.value.slice(1))
const ext = computed(() => (language.value === 'javascript' ? 'js' : language.value === 'python' ? 'py' : 'txt'))
const source = computed(() => input.value.source || '')
// Fenced block so MDC/Shiki syntax-highlights the code; ProsePre's own card
// chrome is stripped in the template so it blends into the editor panel.
const codeMarkdown = computed(() => `\`\`\`${language.value}\n${source.value}\n\`\`\``)

const output = computed(() => {
  const value = (props.part as { output?: unknown }).output
  return typeof value === 'string' ? value : ''
})
const errorText = computed(() => (props.part as { errorText?: string }).errorText ?? '')

const status = computed<'running' | 'done' | 'error'>(() => {
  if (props.part.state === 'input-streaming' || props.part.state === 'input-available') return 'running'
  if (props.part.state === 'output-error') return 'error'
  return 'done'
})
const finished = computed(() => status.value !== 'running')
const displayOutput = computed(() => (status.value === 'error' ? errorText.value : output.value))

const copied = ref(false)
async function copyCode() {
  try {
    await navigator.clipboard.writeText(source.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // clipboard blocked — ignore
  }
}
</script>

<template>
  <UCollapsible
    default-open
    :unmount-on-hide="false"
    class="group my-3 overflow-hidden rounded-2xl border border-default bg-default shadow-sm ring-1 ring-transparent transition-all duration-200 hover:ring-primary/15"
  >
    <template #default="{ open }">
      <!-- Trigger (renders as-child → aria-expanded + keyboard toggle). -->
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated/60"
      >
        <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <UIcon name="i-lucide-terminal" class="size-3" />
        </span>

        <span class="truncate text-sm font-medium text-highlighted">{{ languageLabel }}</span>

        <span
          class="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="{
            'bg-amber-500/10 text-amber-600 dark:text-amber-400': status === 'running',
            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': status === 'done',
            'bg-red-500/10 text-red-600 dark:text-red-400': status === 'error'
          }"
        >
          <UIcon v-if="status === 'running'" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
          <UIcon v-else-if="status === 'done'" name="i-lucide-check" class="size-3.5" />
          <UIcon v-else name="i-lucide-x" class="size-3.5" />
          {{ status === 'running' ? 'Running' : status === 'done' ? 'Done' : 'Error' }}
        </span>

        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 shrink-0 text-dimmed transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
        />
      </button>
    </template>

    <template #content>
      <div class="space-y-2 border-t border-default p-3">
        <!-- Editor panel: a window title bar (traffic lights + filename + copy)
             above the code on a theme-aware code surface. -->
        <div class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-1.5">
            <span class="flex items-center gap-1.5" aria-hidden="true">
              <span class="size-2.5 rounded-full bg-red-400/70" />
              <span class="size-2.5 rounded-full bg-amber-400/70" />
              <span class="size-2.5 rounded-full bg-emerald-400/70" />
            </span>
            <span class="font-mono text-xs text-dimmed">main.{{ ext }}</span>
            <button
              type="button"
              class="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-default hover:text-default"
              :aria-label="copied ? 'Copied' : 'Copy code'"
              @click="copyCode"
            >
              <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" :class="copied ? 'text-emerald-500' : ''" />
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <!-- Shiki-highlighted code via MDC. ProsePre wraps it in its own card
               with a language header + copy button; strip that chrome (keep its
               code surface) so it sits flush in this panel. The descendant
               selectors out-specify ProsePre's single-class utilities. -->
          <div class="max-h-80 overflow-auto [&_.group]:my-0 [&_.group]:rounded-none [&_.group]:border-0 [&_.group]:shadow-none [&_.justify-between]:hidden [&_button]:hidden">
            <MDC :value="codeMarkdown" />
          </div>
        </div>

        <!-- Console panel: a dark terminal surface for stdout/stderr. -->
        <div
          v-if="finished"
          class="overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-800 dark:bg-slate-950 dark:ring-slate-800"
        >
          <div class="flex items-center gap-1.5 border-b border-slate-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <UIcon
              :name="status === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-square-terminal'"
              class="size-3.5"
              :class="status === 'error' ? 'text-red-400' : 'text-slate-500'"
            />
            Output
          </div>
          <pre
            v-if="displayOutput"
            :class="[
              status === 'error' ? 'text-red-300' : 'text-slate-100',
              'max-h-72 overflow-auto px-3.5 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap wrap-break-word'
            ]"
          >{{ displayOutput }}</pre>
          <p v-else class="px-3.5 py-3 font-mono text-[13px] text-slate-500">
            (no output)
          </p>
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
