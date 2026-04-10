<script setup lang="ts">
// @ts-nocheck
import { Bar, Pie } from 'vue-chartjs'

type ChartType = 'bar' | 'pie'
type ChartDataset = { label: string, data: number[], backgroundColor?: string | string[] }
type TransactionItem = { id: number, date: string, name: string, amount: number }
type ChartLegendRow = { label: string, value: number, percent: number, color: string, transactions?: TransactionItem[] }
type ChartNavigation = { route: string, month: number, year: number }
type ChartPayload = {
  title?: string
  type?: ChartType
  labels: string[]
  datasets: ChartDataset[]
  legend?: ChartLegendRow[]
  navigation?: ChartNavigation
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

const localPayload = ref<ChartPayload | null>(parsed.value)
watch(parsed, val => { localPayload.value = val })

const activeType = ref<ChartType>(parsed.value?.type === 'bar' ? 'bar' : 'pie')

const navLoading = ref(false)

const MONTH_NAV_START = new Date(2026, 0, 1) // January 2026

const monthOptions = computed(() => {
  const nav = localPayload.value?.navigation
  if (!nav) return []
  const opts: { label: string, value: string }[] = []
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), 1)
  while (d >= MONTH_NAV_START) {
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    opts.push({
      label: d.toLocaleString('en', { month: 'long', year: 'numeric' }),
      value: `${y}-${m}`
    })
    d = new Date(y, d.getMonth() - 1, 1)
  }
  return opts
})

const selectedMonth = computed(() => {
  const nav = localPayload.value?.navigation
  return nav ? `${nav.year}-${nav.month}` : ''
})

async function navigateToMonth(value: string) {
  const nav = localPayload.value?.navigation
  if (!nav || navLoading.value) return
  const [year, month] = value.split('-').map(Number)
  navLoading.value = true
  try {
    const data = await $fetch<ChartPayload>(nav.route, { params: { month, year } })
    localPayload.value = data
    expandedCategories.value = new Set()
  }
  finally {
    navLoading.value = false
  }
}
const expandedCategories = ref<Set<string>>(new Set())

function toggleCategory(label: string) {
  const next = new Set(expandedCategories.value)
  next.has(label) ? next.delete(label) : next.add(label)
  expandedCategories.value = next
}

function onExpandEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = '0'
  e.style.opacity = '0'
  e.style.overflow = 'hidden'
  requestAnimationFrame(() => {
    e.style.transition = 'height 0.2s ease, opacity 0.2s ease'
    e.style.height = e.scrollHeight + 'px'
    e.style.opacity = '1'
  })
}

function onExpandAfterEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = ''
  e.style.overflow = ''
  e.style.transition = ''
  e.style.opacity = ''
}

function onExpandLeave(el: Element) {
  const e = el as HTMLElement
  e.style.height = e.scrollHeight + 'px'
  e.style.overflow = 'hidden'
  requestAnimationFrame(() => {
    e.style.transition = 'height 0.15s ease, opacity 0.15s ease'
    e.style.height = '0'
    e.style.opacity = '0'
  })
}

const DEFAULT_COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

const primaryDataset = computed(() => localPayload.value?.datasets?.[0] ?? null)
const total = computed(() => (primaryDataset.value?.data.reduce((sum, value) => sum + Math.round(value * 100), 0) ?? 0) / 100)

const legendRows = computed(() => {
  if (!localPayload.value) return []
  if (localPayload.value.legend) return localPayload.value.legend
  if (!primaryDataset.value) return []
  return localPayload.value.labels.map((label, index) => {
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
  if (!localPayload.value) return null
  const datasets = localPayload.value.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor: ds.backgroundColor ?? (
      activeType.value === 'pie' || i === 0
        ? localPayload.value!.labels.map((_, j) => DEFAULT_COLORS[j % DEFAULT_COLORS.length])
        : DEFAULT_COLORS[i % DEFAULT_COLORS.length]
    ),
    borderColor: activeType.value === 'bar' ? 'rgba(255,255,255,0.75)' : undefined,
    borderWidth: activeType.value === 'bar' ? 1.5 : 0,
    hoverBorderWidth: activeType.value === 'bar' ? 1.5 : 0,
    borderRadius: activeType.value === 'bar' ? 10 : undefined
  }))
  return { labels: localPayload.value.labels, datasets }
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
          <div class="min-w-0 flex-1">
            <p v-if="localPayload?.title" class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ localPayload.title }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ total.toFixed(2) }}</span>
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <div class="flex gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
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
            <div v-if="localPayload?.navigation" class="rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
              <USelect
                :model-value="selectedMonth"
                :items="monthOptions"
                :disabled="navLoading"
                size="xs"
                color="neutral"
                variant="ghost"
                :ui="{ base: 'cursor-pointer' }"
                @update:model-value="navigateToMonth"
              />
            </div>
          </div>
        </div>
        <div class="h-80">
          <Bar v-if="activeType === 'bar'" :data="chartData" :options="chartOptions" />
          <Pie v-else :data="chartData" :options="chartOptions" />
        </div>
        <div v-if="legendRows.length" class="mt-4 grid gap-2">
          <div
            v-for="item in legendRows"
            :key="item.label"
            class="rounded-xl border border-slate-200/70 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/50"
          >
            <div
              class="flex items-center gap-2 px-3 py-2"
              :class="item.transactions?.length ? 'cursor-pointer select-none' : ''"
              @click="item.transactions?.length ? toggleCategory(item.label) : undefined"
            >
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: item.color }" />
              <span class="flex-1 text-xs font-medium text-slate-700 dark:text-slate-200">{{ item.label }}</span>
              <span class="text-xs text-slate-500 dark:text-slate-400">{{ item.value }} ({{ item.percent }}%)</span>
              <UIcon
                v-if="item.transactions?.length"
                :name="expandedCategories.has(item.label) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="h-3.5 w-3.5 shrink-0 text-slate-400"
              />
            </div>
            <div class="px-3 pb-1">
              <div class="relative h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-700/70">
                <div
                  class="h-1.5 rounded-full transition-all"
                  :style="{
                    width: item.percent > 0 ? `${Math.min(item.percent, 100)}%` : '2px',
                    backgroundColor: item.percent > 100 ? '#ef4444' : item.color
                  }"
                />
              </div>
            </div>
            <Transition
              @enter="onExpandEnter"
              @after-enter="onExpandAfterEnter"
              @leave="onExpandLeave"
            >
              <div v-if="expandedCategories.has(item.label) && item.transactions?.length" class="border-t border-slate-200/70 dark:border-slate-700/60 px-3 py-2 space-y-1">
                <div
                  v-for="tx in item.transactions"
                  :key="tx.id"
                  class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                >
                  <span class="shrink-0 text-slate-400 dark:text-slate-500">{{ tx.date }}</span>
                  <span class="flex-1 truncate">{{ tx.name }}</span>
                  <span class="shrink-0 font-medium text-slate-700 dark:text-slate-300">{{ tx.amount }} CZK</span>
                </div>
              </div>
            </Transition>
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
