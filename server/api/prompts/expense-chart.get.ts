import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type ExpenseCategory = { id: number, label: string, percent: number, color: string }

const TAILWIND_COLORS: Record<string, string> = {
  cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
  rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
  orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
  green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
}

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const query = getQuery(event)
  const now = new Date()
  const month = query.month !== undefined ? parseInt(query.month as string) : now.getMonth() + 1
  const year = query.year ? parseInt(query.year as string) : now.getFullYear()
  const isFullYear = month === 0

  const dateFrom = isFullYear ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = isFullYear ? `${year}-12-31` : new Date(year, month, 0).toISOString().slice(0, 10)
  const periodLabel = isFullYear ? String(year) : new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  const client = await createMcpClient(event)

  const [transactions, categories] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories')
  ])

  const catById = new Map(categories.map(r => [String(r.id), r]))
  const catByLabel = new Map(categories.map(r => [r.label.toLowerCase(), r]))
  const colorMap = new Map(categories.map(r => [r.label, TAILWIND_COLORS[r.color] ?? '#94a3b8']))

  const totals = new Map<string, number>()
  const txByLabel = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const cat = catById.get(tx.category) ?? catByLabel.get(tx.category.toLowerCase())
    const label = cat?.label ?? tx.category ?? 'Other'
    totals.set(label, (totals.get(label) ?? 0) + tx.amount)
    const list = txByLabel.get(label) ?? []
    list.push(tx)
    txByLabel.set(label, list)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((s, [, v]) => s + v, 0)
  const colors = sorted.map(([label]) => colorMap.get(label) ?? '#94a3b8')

  return {
    title: `Expenses by category — ${periodLabel}`,
    navigation: { route: '/api/prompts/expense-chart', month, year },
    type: 'pie',
    labels: sorted.map(([label]) => label),
    datasets: [{
      label: 'Amount (CZK)',
      data: sorted.map(([, amount]) => Math.round(amount * 100) / 100),
      backgroundColor: colors
    }],
    legend: sorted.map(([label, amount], i) => ({
      label,
      value: Math.round(amount * 100) / 100,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: colors[i],
      transactions: (txByLabel.get(label) ?? []).map(tx => ({ id: tx.id, date: tx.date, name: tx.name, amount: tx.amount }))
    }))
  }
})
