<script setup lang="ts">
type ExpenseCategory = { id: number, label: string, percent: number, color: string, amount: number }
type IncomeCategory = { id: number, label: string, color: string, amount: number }
type Navigation = { route: string, month: number, year: number }
type CategoriesPayload = {
  expense: ExpenseCategory[]
  income: IncomeCategory[]
  totalPercent: number
  totalIncome: number
  periodLabel: string
  navigation?: Navigation
}

const TAILWIND_COLORS: Record<string, string> = {
  cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
  rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
  orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
  green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
}

const MONTH_NAV_START = new Date(2026, 0, 1)

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as CategoriesPayload }
  catch { return null }
})

const localData = ref<CategoriesPayload | null>(parsed.value)
watch(parsed, val => { localData.value = val })

const navLoading = ref(false)

const monthOptions = computed(() => {
  const nav = localData.value?.navigation
  if (!nav) return []
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

const selectedMonth = computed(() => {
  const nav = localData.value?.navigation
  return nav ? `${nav.year}-${nav.month}` : ''
})

async function navigateToMonth(value: string) {
  const nav = localData.value?.navigation
  if (!nav || navLoading.value) return
  const [year, month] = value.split('-').map(Number)
  navLoading.value = true
  try {
    const data = await $fetch<CategoriesPayload>(nav.route, { params: { month, year } })
    localData.value = data
  }
  finally { navLoading.value = false }
}
</script>

<template>
  <div v-if="localData" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Categories — {{ localData.periodLabel }}
        </p>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Income: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ localData.totalIncome.toFixed(2) }} CZK</span>
        </p>
      </div>
      <div v-if="localData.navigation" class="shrink-0 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
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

    <!-- Income categories -->
    <p class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Income</p>
    <div class="space-y-1.5 mb-5">
      <div
        v-for="cat in localData.income"
        :key="cat.id"
        class="flex items-center gap-3 rounded-lg px-3 py-2"
        :style="{ backgroundColor: (TAILWIND_COLORS[cat.color] ?? '#94a3b8') + '12' }"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: TAILWIND_COLORS[cat.color] ?? '#94a3b8' }" />
        <span class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{{ cat.label }}</span>
        <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ cat.amount.toFixed(2) }} CZK</span>
      </div>
    </div>

    <!-- Expense categories -->
    <p class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Expenses allocation</p>
    <div class="space-y-1.5 mb-4">
      <div
        v-for="cat in localData.expense"
        :key="cat.id"
        class="flex items-center gap-3 rounded-lg px-3 py-2"
        :style="{ backgroundColor: (TAILWIND_COLORS[cat.color] ?? '#94a3b8') + '12' }"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: TAILWIND_COLORS[cat.color] ?? '#94a3b8' }" />
        <span class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{{ cat.label }}</span>
        <span class="text-xs text-slate-500 dark:text-slate-400">{{ cat.percent }}%</span>
        <span class="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-20 text-right">{{ cat.amount.toFixed(2) }} CZK</span>
      </div>
    </div>

    <!-- Total allocation -->
    <div
      class="rounded-lg px-3 py-2 text-xs"
      :class="localData.totalPercent === 100
        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
        : localData.totalPercent < 100
          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400'"
    >
      Total: <span class="font-semibold">{{ localData.totalPercent }}%</span>
      <template v-if="localData.totalPercent === 100"> — fully allocated</template>
      <template v-else-if="localData.totalPercent < 100"> — {{ 100 - localData.totalPercent }}% unallocated</template>
      <template v-else> — over-allocated by {{ localData.totalPercent - 100 }}%</template>
    </div>
  </div>
</template>
