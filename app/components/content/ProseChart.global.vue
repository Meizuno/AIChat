<script setup lang="ts">
// @ts-nocheck
import { Bar, Pie } from 'vue-chartjs'

type ChartType = 'bar' | 'pie'
type ChartDataset = { label: string, data: number[], backgroundColor?: string | string[] }
type ChartPayload = {
  title?: string
  type?: ChartType
  labels: string[]
  datasets: ChartDataset[]
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try {
    return JSON.parse(props.code.trim()) as ChartPayload
  }
  catch {
    return null
  }
})

const activeType = ref<ChartType>(parsed.value?.type === 'bar' ? 'bar' : 'pie')

const DEFAULT_COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

const primaryDataset = computed(() => parsed.value?.datasets?.[0] ?? null)
const total = computed(() => primaryDataset.value?.data.reduce((sum, value) => sum + value, 0) ?? 0)

const legendRows = computed(() => {
  if (!parsed.value || !primaryDataset.value) return []
  return parsed.value.labels.map((label, index) => {
    const value = primaryDataset.value?.data[index] ?? 0
    const percent = total.value > 0 ? Math.round((value / total.value) * 100) : 0
    return {
      label,
      value,
      percent,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    }
  })
})

const chartData = computed(() => {
  if (!parsed.value) return null
  const datasets = parsed.value.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor: ds.backgroundColor ?? (
      activeType.value === 'pie' || i === 0
        ? parsed.value!.labels.map((_, j) => DEFAULT_COLORS[j % DEFAULT_COLORS.length])
        : DEFAULT_COLORS[i % DEFAULT_COLORS.length]
    ),
    borderColor: activeType.value === 'bar' ? 'rgba(255,255,255,0.75)' : undefined,
    borderWidth: activeType.value === 'bar' ? 1.5 : 0,
    hoverBorderWidth: activeType.value === 'bar' ? 1.5 : 0,
    borderRadius: activeType.value === 'bar' ? 10 : undefined
  }))
  return { labels: parsed.value.labels, datasets }
})

const staticOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  animation: { duration: 700, easing: 'easeOutQuart' as const },
  plugins: {
    title: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.9)',
      titleColor: '#f8fafc',
      bodyColor: '#e2e8f0',
      borderColor: 'rgba(148,163,184,0.2)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 10
    }
  }
}

const barScales = {
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(148,163,184,0.16)' },
      border: { display: false },
      ticks: { color: '#64748b' }
    },
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: '#475569' }
    }
  }
}

const chartOptions = computed(() => ({
  ...staticOptions,
  plugins: {
    ...staticOptions.plugins,
    legend: {
      display: activeType.value === 'pie',
      position: 'bottom' as const,
      labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16 }
    }
  },
  ...(activeType.value === 'bar' ? barScales : { cutout: '58%' })
}))
</script>

<template>
  <ClientOnly>
    <template #fallback>
      <div class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
        <USkeleton class="mb-4 h-4 w-40 rounded" />
        <USkeleton class="h-80 w-full rounded-xl" />
      </div>
    </template>
    <div class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
      <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" />
      <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
      <template v-if="chartData">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p v-if="parsed?.title" class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ parsed.title }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ total }}</span>
            </p>
          </div>
          <div class="ml-auto flex gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
            <UButton
              size="xs"
              :variant="activeType === 'bar' ? 'solid' : 'ghost'"
              color="primary"
              icon="i-lucide-bar-chart-2"
              aria-label="Bar chart"
              @click="activeType = 'bar'"
            />
            <UButton
              size="xs"
              :variant="activeType === 'pie' ? 'solid' : 'ghost'"
              color="primary"
              icon="i-lucide-pie-chart"
              aria-label="Pie chart"
              @click="activeType = 'pie'"
            />
          </div>
        </div>
        <div class="h-80">
          <Bar v-if="activeType === 'bar'" :data="chartData" :options="chartOptions" />
          <Pie v-else :data="chartData" :options="chartOptions" />
        </div>
        <div v-if="legendRows.length" class="mt-4 grid gap-2 sm:grid-cols-2">
          <div
            v-for="item in legendRows"
            :key="item.label"
            class="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/50"
          >
            <div class="mb-1 flex items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: item.color }" />
                <span class="font-medium text-slate-700 dark:text-slate-200">{{ item.label }}</span>
              </div>
              <span class="text-slate-500 dark:text-slate-400">{{ item.value }} ({{ item.percent }}%)</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-700/70">
              <div
                class="h-1.5 rounded-full"
                :style="{ width: `${item.percent}%`, backgroundColor: item.color }"
              />
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <USkeleton class="mb-4 h-4 w-40 rounded" />
        <USkeleton class="h-80 w-full rounded-xl" />
      </template>
    </div>
  </ClientOnly>
</template>
