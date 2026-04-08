import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type SalesSplitRule = { id: number, label: string, percent: number, color: string }
type SalesSplitPreview = {
  totalIncome: number
  rules: { id: number, label: string, percent: number, amount: number }[]
  unallocatedPercent: number
  unallocatedAmount: number
}

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const client = await createMcpClient(event)

  const [transactions, rules, preview] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<SalesSplitRule[]>(client, 'get_sales_split'),
    callMcpTool<SalesSplitPreview>(client, 'get_sales_split_preview')
  ])

  const TAILWIND_COLORS: Record<string, string> = {
    cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
    rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
    orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
    green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
  }

  const ruleById = new Map(rules.map(r => [String(r.id), r]))
  const ruleByLabel = new Map(rules.map(r => [r.label.toLowerCase(), r]))
  const colorMap = new Map(rules.map(r => [r.label, TAILWIND_COLORS[r.color] ?? '#94a3b8']))

  const salaryMap = new Map(preview.rules.map(r => [r.label, r.amount]))
  if (preview.unallocatedAmount > 0) {
    salaryMap.set('Unallocated', preview.unallocatedAmount)
    colorMap.set('Unallocated', '#94a3b8')
  }

  // Sum actual expenses by category label, match by ID or label string
  const expenseMap = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const rule = ruleById.get(tx.category) ?? ruleByLabel.get(tx.category.toLowerCase())
    const label = rule?.label ?? tx.category ?? 'Other'
    expenseMap.set(label, (expenseMap.get(label) ?? 0) + tx.amount)
  }

  // Sort by allocated amount descending
  const labels = [...salaryMap.keys()].sort((a, b) => (salaryMap.get(b) ?? 0) - (salaryMap.get(a) ?? 0))

  const allocated = labels.map(l => Math.round((salaryMap.get(l) ?? 0) * 100) / 100)
  const spent = labels.map(l => Math.round((expenseMap.get(l) ?? 0) * 100) / 100)
  const percentSpent = labels.map((_, i) => {
    const a = allocated[i]
    return a > 0 ? Math.round((spent[i] / a) * 100) : 0
  })

  const totalAllocated = allocated.reduce((s, v) => s + v, 0)
  const totalSpent = spent.reduce((s, v) => s + v, 0)
  const totalPercent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0

  const categoryColors = labels.map(l => colorMap.get(l) ?? '#94a3b8')

  const legend = labels.map((l, i) => ({
    label: l,
    value: spent[i],
    percent: percentSpent[i],
    color: categoryColors[i]
  }))

  return {
    title: `Salary vs Expenses — ${now.toLocaleString('en', { month: 'long', year: 'numeric' })} | Total: ${totalSpent} / ${totalAllocated} CZK (${totalPercent}%)`,
    type: 'bar',
    labels: labels.map((l, i) => `${l} (${percentSpent[i]}%)`),
    datasets: [
      {
        label: 'Allocated (CZK)',
        data: allocated,
        backgroundColor: categoryColors.map(c => `${c}80`)
      },
      {
        label: 'Spent (CZK)',
        data: spent,
        backgroundColor: categoryColors
      }
    ],
    legend
  }
})
