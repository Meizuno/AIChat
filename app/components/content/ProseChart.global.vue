<script setup lang="ts">
import { Bar } from 'vue-chartjs'

// A simple, universal bar chart. Rendered from a ```chart fenced block whose
// content is JSON:
//   { "title"?: string, "unit"?: string,
//     "data": [ { "label": string, "value": number, "color"?: string } ] }
// Colors are optional — a palette fills in the rest. No data fetching: the
// values come inline in the block, so any tool/model can emit a chart.
type ChartItem = { label: string, value: number, color?: string }
type ChartPayload = { title?: string, unit?: string, data: ChartItem[] }

const PALETTE = [
  '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#0ea5e9',
  '#6366f1', '#ec4899', '#f97316', '#14b8a6', '#84cc16', '#a855f7'
]

const props = defineProps({
  code: { type: String, required: true }
})

const payload = computed<ChartPayload | null>(() => {
  try {
    const p = JSON.parse(props.code.trim())
    return p && Array.isArray(p.data) ? p as ChartPayload : null
  } catch {
    return null
  }
})

const items = computed(() =>
  (payload.value?.data ?? [])
    .filter(d => d && d.label != null)
    .map((d, i) => ({
      label: String(d.label),
      value: Number(d.value ?? 0),
      color: d.color || PALETTE[i % PALETTE.length]!
    }))
)

const fmt = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 2 })
const unit = computed(() => (payload.value?.unit ? ` ${payload.value.unit}` : ''))

const chartData = computed(() => {
  if (!items.value.length) return null
  return {
    labels: items.value.map(i => i.label),
    datasets: [{
      data: items.value.map(i => i.value),
      backgroundColor: items.value.map(i => i.color),
      borderColor: 'rgba(255,255,255,0.75)',
      borderWidth: 1.5,
      borderRadius: 8
    }]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600, easing: 'easeOutQuart' as const },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.9)',
      titleColor: '#f8fafc',
      bodyColor: '#e2e8f0',
      padding: 10,
      cornerRadius: 10
    }
  },
  scales: {
    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.16)' }, border: { display: false }, ticks: { color: '#64748b' } },
    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#475569' } }
  }
}
</script>

<template>
  <ClientOnly>
    <template #fallback>
      <div class="my-5 w-full rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <USkeleton class="mb-4 h-4 w-40 rounded" />
        <USkeleton class="h-64 w-full rounded-xl" />
      </div>
    </template>
    <div class="my-5 w-full rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <template v-if="chartData">
        <p
          v-if="payload?.title"
          class="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          {{ payload.title }}
        </p>
        <div class="h-64">
          <Bar
            :data="chartData"
            :options="chartOptions"
          />
        </div>
        <!-- Legend: compact inline chips (label + value adjacent, wrapping) -->
        <div class="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          <div
            v-for="item in items"
            :key="item.label"
            class="flex items-center gap-1.5 text-xs"
          >
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: item.color }"
            />
            <span class="font-medium text-slate-700 dark:text-slate-200">{{ item.label }}</span>
            <span class="text-slate-500 dark:text-slate-400">{{ fmt(item.value) }}{{ unit }}</span>
          </div>
        </div>
      </template>
      <!-- Not-yet-parseable (e.g. the block is still streaming) — show a
           skeleton rather than an error, then render once the JSON completes. -->
      <USkeleton
        v-else
        class="h-64 w-full rounded-xl"
      />
    </div>
  </ClientOnly>
</template>
