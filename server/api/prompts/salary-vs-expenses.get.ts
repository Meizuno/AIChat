import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type ExpenseCategory = { id: number, label: string, percent: number, color: string }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const query = getQuery(event)
  const now = new Date()
  const month = query.month ? parseInt(query.month as string) : now.getMonth() + 1
  const year = query.year ? parseInt(query.year as string) : now.getFullYear()

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = new Date(year, month, 0).toISOString().slice(0, 10)

  const client = await createMcpClient(event)

  const [expenseTx, incomeTx, categories] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'income', dateFrom, dateTo }),
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories')
  ])

  const TAILWIND_COLORS: Record<string, string> = {
    cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
    rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
    orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
    green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
  }

  const ruleById = new Map(categories.map(r => [String(r.id), r]))
  const ruleByLabel = new Map(categories.map(r => [r.label.toLowerCase(), r]))
  const colorMap = new Map(categories.map(r => [r.label, TAILWIND_COLORS[r.color] ?? '#94a3b8']))

  // Total income for the selected month (CZK only)
  const totalIncome = incomeTx
    .filter(tx => !tx.currency || tx.currency === 'CZK')
    .reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0) / 100

  // Allocation per category based on this month's income
  const totalAllocatedPercent = categories.reduce((s, c) => s + Number(c.percent), 0)
  const unallocatedPercent = Math.max(0, 100 - totalAllocatedPercent)
  const unallocatedAmount = Math.round(totalIncome * unallocatedPercent) / 100

  const salaryMap = new Map(categories.map(c => [
    c.label,
    Math.round(totalIncome * Number(c.percent)) / 100
  ]))
  if (unallocatedAmount > 0) {
    salaryMap.set('Unallocated', unallocatedAmount)
    colorMap.set('Unallocated', '#94a3b8')
  }

  // Sum actual expenses by category label, match by ID or label string
  const expenseMap = new Map<string, number>()
  const txByLabel = new Map<string, Transaction[]>()
  for (const tx of expenseTx) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const rule = ruleById.get(tx.category) ?? ruleByLabel.get(tx.category.toLowerCase())
    const label = rule?.label ?? tx.category ?? 'Other'
    expenseMap.set(label, (expenseMap.get(label) ?? 0) + tx.amount)
    const list = txByLabel.get(label) ?? []
    list.push(tx)
    txByLabel.set(label, list)
  }

  // Sort by allocated amount descending
  const labels = [...salaryMap.keys()].sort((a, b) => (salaryMap.get(b) ?? 0) - (salaryMap.get(a) ?? 0))

  const allocated = labels.map(l => Math.round((salaryMap.get(l) ?? 0) * 100) / 100)
  const spent = labels.map(l => Math.round((expenseMap.get(l) ?? 0) * 100) / 100)
  const percentSpent = labels.map((_, i) => {
    const a = allocated[i]
    return a > 0 ? Math.round((spent[i] / a) * 100) : 0
  })

  const totalAllocated = allocated.reduce((s, v) => s + Math.round(v * 100), 0) / 100
  const totalSpent = spent.reduce((s, v) => s + Math.round(v * 100), 0) / 100
  const totalPercent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0

  const categoryColors = labels.map(l => colorMap.get(l) ?? '#94a3b8')

  const legend = labels.map((l, i) => ({
    label: l,
    value: spent[i],
    percent: percentSpent[i],
    color: categoryColors[i],
    transactions: (txByLabel.get(l) ?? []).map(tx => ({ id: tx.id, date: tx.date, name: tx.name, amount: tx.amount }))
  }))

  return {
    title: `Salary vs Expenses — ${new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })} | Total: ${totalSpent.toFixed(2)} / ${totalAllocated.toFixed(2)} CZK (${totalPercent}%)`,
    navigation: { route: '/api/prompts/salary-vs-expenses', month, year },
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
