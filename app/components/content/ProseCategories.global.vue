<script setup lang="ts">
type ExpenseCategory = { id: number, label: string, percent: number, color: string }
type IncomeCategory = { id: number, label: string, color: string }
type CategoriesPayload = {
  expense: ExpenseCategory[]
  income: IncomeCategory[]
  totalPercent: number
}

const TAILWIND_COLORS: Record<string, string> = {
  cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
  rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
  orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
  green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
}

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try { return JSON.parse(props.code.trim()) as CategoriesPayload }
  catch { return null }
})
</script>

<template>
  <div v-if="parsed" class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <!-- Expense categories -->
    <p class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Expense categories</p>
    <div class="space-y-1.5 mb-4">
      <div
        v-for="cat in parsed.expense"
        :key="cat.id"
        class="flex items-center gap-3 rounded-lg px-3 py-2"
        :style="{ backgroundColor: (TAILWIND_COLORS[cat.color] ?? '#94a3b8') + '12' }"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: TAILWIND_COLORS[cat.color] ?? '#94a3b8' }" />
        <span class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{{ cat.label }}</span>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{ cat.percent }}%</span>
      </div>
    </div>

    <!-- Total -->
    <div class="rounded-lg px-3 py-2 mb-6 text-xs" :class="parsed.totalPercent === 100 ? 'bg-green-500/10 text-green-600 dark:text-green-400' : parsed.totalPercent < 100 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'">
      Total: <span class="font-semibold">{{ parsed.totalPercent }}%</span>
      <template v-if="parsed.totalPercent === 100"> — fully allocated</template>
      <template v-else-if="parsed.totalPercent < 100"> — {{ 100 - parsed.totalPercent }}% unallocated</template>
      <template v-else> — over-allocated by {{ parsed.totalPercent - 100 }}%</template>
    </div>

    <!-- Income categories -->
    <p class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Income categories</p>
    <div class="space-y-1.5">
      <div
        v-for="cat in parsed.income"
        :key="cat.id"
        class="flex items-center gap-3 rounded-lg px-3 py-2"
        :style="{ backgroundColor: (TAILWIND_COLORS[cat.color] ?? '#94a3b8') + '12' }"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: TAILWIND_COLORS[cat.color] ?? '#94a3b8' }" />
        <span class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{{ cat.label }}</span>
      </div>
    </div>
  </div>
</template>
