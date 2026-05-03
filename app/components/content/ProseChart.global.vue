<script setup lang="ts">
// @ts-expect-error vue-chartjs types incompatible with strict mode
import { Bar } from 'vue-chartjs'

type TxRow = { id: number, date: string, name: string, amount: number, currency: string, category: number }
type ExpenseCat = { id: number, label: string, color: string, percent: number, position: number }
type IncomeCat = { id: number, label: string, color: string, position: number }
type FinancePayload = {
  expenses: TxRow[]
  incomes: TxRow[]
  expenseCategories: ExpenseCat[]
  incomeCategories: IncomeCat[]
}

type LegendItem = { label: string, value: number, allocated?: number, percent: number, color: string, transactions: TxRow[] }
type LegendGroup = { label: string, items: LegendItem[] }

const TAILWIND_COLORS: Record<string, string> = {
  cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
  rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
  orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
  green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308',
  gray: '#94a3b8', slate: '#94a3b8'
}

const FINANCE_ROUTE = '/api/prompts/finance'
const MONTH_NAV_START = new Date(2026, 0, 1) // January 2026

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as FinancePayload }
  catch { return null }
})

const localPayload = ref<FinancePayload | null>(parsed.value)
watch(parsed, val => { localPayload.value = val })

// Server no longer echoes period — default to current month/year; picker updates this.
const _now = new Date()
const currentNav = ref<{ month: number, year: number }>({ month: _now.getMonth() + 1, year: _now.getFullYear() })

const navLoading = ref(false)
const expandedCategories = ref<Set<string>>(new Set())

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// --- CZK-only transaction views (non-CZK ignored) ---
const czkExpenses = computed(() => (localPayload.value?.expenses ?? []).filter(e => e.currency === 'CZK'))
const czkIncomes = computed(() => (localPayload.value?.incomes ?? []).filter(i => i.currency === 'CZK'))

const incomeCatById = computed(() => new Map((localPayload.value?.incomeCategories ?? []).map(c => [c.id, c])))

// --- Income aggregation ---
const totalIncome = computed(() => round2(czkIncomes.value.reduce((s, i) => s + i.amount, 0)))

const incomeLegend = computed<LegendItem[]>(() => {
  const byLabel = new Map<string, { total: number, color: string, txs: TxRow[] }>()
  for (const tx of czkIncomes.value) {
    const cat = incomeCatById.value.get(tx.category)
    const label = cat?.label ?? 'Other'
    const color = cat ? (TAILWIND_COLORS[cat.color] ?? '#94a3b8') : '#94a3b8'
    const entry = byLabel.get(label) ?? { total: 0, color, txs: [] }
    entry.total += tx.amount
    entry.txs.push(tx)
    byLabel.set(label, entry)
  }
  return [...byLabel.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([label, { total, color, txs }]) => ({
      label,
      value: round2(total),
      percent: totalIncome.value > 0 ? Math.round(total / totalIncome.value * 100) : 0,
      color,
      transactions: [...txs].sort((a, b) => b.date.localeCompare(a.date))
    }))
})

// --- Expense aggregation ---
type ExpenseRow = {
  label: string
  allocated: number
  spent: number
  percent: number
  color: string
  transactions: TxRow[]
}

const expenseRows = computed<ExpenseRow[]>(() => {
  const cats = localPayload.value?.expenseCategories ?? []
  const txByCat = new Map<number, TxRow[]>()
  for (const tx of czkExpenses.value) {
    const list = txByCat.get(tx.category) ?? []
    list.push(tx)
    txByCat.set(tx.category, list)
  }
  const rows: ExpenseRow[] = cats.map((c) => {
    const txs = txByCat.get(c.id) ?? []
    const spent = txs.reduce((s, t) => s + t.amount, 0)
    const allocated = round2(totalIncome.value * c.percent / 100)
    return {
      label: c.label,
      allocated,
      spent: round2(spent),
      percent: allocated > 0 ? Math.round(spent / allocated * 100) : 0,
      color: TAILWIND_COLORS[c.color] ?? '#94a3b8',
      transactions: [...txs].sort((a, b) => b.date.localeCompare(a.date))
    }
  })
  const knownIds = new Set(cats.map(c => c.id))
  const orphans: TxRow[] = []
  for (const [catId, txs] of txByCat.entries()) {
    if (!knownIds.has(catId)) orphans.push(...txs)
  }
  if (orphans.length) {
    rows.push({
      label: 'Other',
      allocated: 0,
      spent: round2(orphans.reduce((s, t) => s + t.amount, 0)),
      percent: 0,
      color: '#94a3b8',
      transactions: [...orphans].sort((a, b) => b.date.localeCompare(a.date))
    })
  }
  return rows.sort((a, b) => b.allocated - a.allocated)
})

const totalAllocated = computed(() => round2(expenseRows.value.reduce((s, e) => s + e.allocated, 0)))
const totalSpent = computed(() => round2(expenseRows.value.reduce((s, e) => s + e.spent, 0)))
const totalPercent = computed(() => totalAllocated.value > 0 ? Math.round(totalSpent.value / totalAllocated.value * 100) : 0)
const totalAllocatedPercent = computed(() => (localPayload.value?.expenseCategories ?? []).reduce((s, c) => s + c.percent, 0))

const netBalance = computed(() => round2(totalIncome.value - totalSpent.value))

// --- Title / subtitle (computed, no server strings) ---
const periodLabel = computed(() => {
  const { month, year } = currentNav.value
  if (month === 0) return String(year)
  return new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })
})

const title = computed(() => `Financial overview — ${periodLabel.value}`)
const subtitle = computed(() =>
  `Income: ${fmt(totalIncome.value)} CZK | Spent: ${fmt(totalSpent.value)} / ${fmt(totalAllocated.value)} CZK (${totalPercent.value}%) | Allocated: ${totalAllocatedPercent.value}%`
)

// --- Legend + chart data ---
const legendGroupsNormalized = computed<LegendGroup[]>(() => {
  const groups: LegendGroup[] = []
  const expenseItems: LegendItem[] = expenseRows.value.map(e => ({
    label: e.label,
    value: e.spent,
    allocated: e.allocated,
    percent: e.percent,
    color: e.color,
    transactions: e.transactions
  }))
  if (expenseItems.length) groups.push({ label: 'Expenses', items: expenseItems })
  if (incomeLegend.value.length) groups.push({ label: 'Income', items: incomeLegend.value })
  return groups
})

const chartData = computed(() => {
  const items = expenseRows.value
  if (!items.length) return null
  const colors = items.map(e => e.color)
  const common = {
    borderColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
    hoverBorderWidth: 1.5,
    borderRadius: 10
  }
  return {
    labels: items.map(e => `${e.label} (${e.percent}%)`),
    datasets: [
      { label: 'Allocated (CZK)', data: items.map(e => e.allocated), backgroundColor: colors.map(c => c + '80'), ...common },
      { label: 'Spent (CZK)',     data: items.map(e => e.spent),     backgroundColor: colors, ...common }
    ]
  }
})

// --- Month picker ---
const monthOptions = computed(() => {
  const now = new Date()
  const yearOpts: { label: string, value: string }[] = []
  for (let y = now.getFullYear(); y >= MONTH_NAV_START.getFullYear(); y--) {
    yearOpts.push({ label: `${y} — Full year`, value: `${y}-0` })
  }
  const monthOpts: { label: string, value: string }[] = []
  let d = new Date(now.getFullYear(), now.getMonth(), 1)
  while (d >= MONTH_NAV_START) {
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    monthOpts.push({
      label: d.toLocaleString('en', { month: 'long', year: 'numeric' }),
      value: `${y}-${m}`
    })
    d = new Date(y, d.getMonth() - 1, 1)
  }
  return [...yearOpts, ...monthOpts]
})

const selectedMonth = computed(() => `${currentNav.value.year}-${currentNav.value.month}`)

async function navigateToMonth(value: string) {
  if (navLoading.value) return
  const [year, month] = value.split('-').map(Number)
  navLoading.value = true
  try {
    const data = await $fetch<FinancePayload>(FINANCE_ROUTE, { params: { month, year } })
    localPayload.value = data
    currentNav.value = { month, year }
    expandedCategories.value = new Set()
  }
  finally { navLoading.value = false }
}

function toggleCategory(label: string) {
  const next = new Set(expandedCategories.value)
  next.has(label) ? next.delete(label) : next.add(label)
  expandedCategories.value = next
}

const { onEnter: onExpandEnter, onAfterEnter: onExpandAfterEnter, onLeave: onExpandLeave } = useExpandAnimation()

// --- Chart.js options ---
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

// Chart instance ref so we can dismiss the tooltip from outside the
// chart's own event flow (touch outside the canvas, etc.).
const chartRef = ref<{ chart?: any } | null>(null)

function dismissTooltip() {
  const chart = chartRef.value?.chart
  if (!chart) return
  chart.setActiveElements([])
  chart.tooltip?.setActiveElements([], { x: 0, y: 0 })
  chart.update()
}

if (import.meta.client) {
  // Tap anywhere outside the chart canvas → dismiss the sticky tooltip.
  // `pointerdown` fires before `click` and covers both mouse and touch.
  const onOutside = (e: PointerEvent) => {
    const chart = chartRef.value?.chart
    if (!chart) return
    const canvas = chart.canvas as HTMLCanvasElement | undefined
    if (!canvas) return
    if (!canvas.contains(e.target as Node)) dismissTooltip()
  }
  onMounted(() => document.addEventListener('pointerdown', onOutside))
  onUnmounted(() => document.removeEventListener('pointerdown', onOutside))
}

const chartOptions = {
  ...staticOptions,
  // Tap on a bar again → toggle the tooltip off. Tap on empty canvas
  // area → also dismiss.
  onClick(_evt: unknown, elements: { index: number }[], chart: any) {
    const active = chart.tooltip?.getActiveElements?.() ?? []
    if (
      elements.length === 0
      || (active.length && elements[0]?.index === active[0]?.index)
    ) {
      dismissTooltip()
    }
  },
  plugins: {
    ...staticOptions.plugins,
    legend: { display: false }
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
            <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ title }}
            </p>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {{ subtitle }}
            </p>
          </div>
          <div class="shrink-0 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
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
        <div class="h-80">
          <Bar ref="chartRef" :data="chartData" :options="chartOptions" />
        </div>
        <div
          v-if="totalIncome > 0 || totalSpent > 0"
          class="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5"
          :class="netBalance >= 0
            ? 'border-emerald-400/30 bg-emerald-500/10'
            : 'border-rose-400/30 bg-rose-500/10'"
        >
          <div class="flex items-center gap-1.5">
            <UIcon
              :name="netBalance >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
              class="h-3.5 w-3.5"
              :class="netBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
            />
            <span
              class="text-[11px] font-medium"
              :class="netBalance >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'"
            >
              {{ netBalance >= 0 ? 'Left this period' : 'Over income' }}
            </span>
          </div>
          <span
            class="text-xs font-semibold"
            :class="netBalance >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'"
          >
            {{ netBalance >= 0 ? '+' : '−' }}{{ fmt(Math.abs(netBalance)) }} CZK
          </span>
        </div>

        <div v-if="legendGroupsNormalized.length" class="mt-4 space-y-4">
          <div v-for="group in legendGroupsNormalized" :key="group.label">
            <p v-if="group.label" class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {{ group.label }}
            </p>
            <div class="grid gap-2">
              <div
                v-for="item in group.items"
                :key="`${group.label}:${item.label}`"
                class="rounded-xl border border-slate-200/70 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/50"
              >
                <div
                  class="flex items-center gap-2 px-3 py-2"
                  :class="item.transactions?.length ? 'cursor-pointer select-none' : ''"
                  @click="item.transactions?.length ? toggleCategory(`${group.label}:${item.label}`) : undefined"
                >
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: item.color }" />
                  <span class="flex-1 text-xs font-medium text-slate-700 dark:text-slate-200">{{ item.label }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">
                    {{ fmt(item.value) }}
                    <template v-if="item.allocated"> / {{ fmt(item.allocated) }}</template>
                    ({{ item.percent }}%)
                  </span>
                  <UIcon
                    v-if="item.transactions?.length"
                    :name="expandedCategories.has(`${group.label}:${item.label}`) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
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
                  <div v-if="expandedCategories.has(`${group.label}:${item.label}`) && item.transactions?.length" class="border-t border-slate-200/70 dark:border-slate-700/60 px-3 py-2 space-y-1">
                    <div
                      v-for="tx in item.transactions"
                      :key="tx.id"
                      class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                    >
                      <span class="shrink-0 text-slate-400 dark:text-slate-500">{{ tx.date }}</span>
                      <span class="flex-1 truncate">{{ tx.name }}</span>
                      <span class="shrink-0 font-medium text-slate-700 dark:text-slate-300">{{ fmt(tx.amount) }} CZK</span>
                    </div>
                  </div>
                </Transition>
              </div>
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
