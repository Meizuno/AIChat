import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type ExpenseCategory = { id: number, label: string, percent: number, color: string }
type IncomeCategory = { id: number, label: string, color: string }

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

  const [expenseTx, incomeTx, expenseCategories, incomeCategories] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'income', dateFrom, dateTo }),
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories'),
    callMcpTool<IncomeCategory[]>(client, 'get_income_categories')
  ])

  const TAILWIND_COLORS: Record<string, string> = {
    cyan: '#06b6d4', violet: '#8b5cf6', amber: '#f59e0b', emerald: '#10b981',
    rose: '#f43f5e', sky: '#0ea5e9', indigo: '#6366f1', pink: '#ec4899',
    orange: '#f97316', teal: '#14b8a6', lime: '#84cc16', red: '#ef4444',
    green: '#22c55e', blue: '#3b82f6', purple: '#a855f7', yellow: '#eab308'
  }

  // --- Income categories ---
  const incCatById = new Map(incomeCategories.map(c => [String(c.id), c]))
  const incCatByLabel = new Map(incomeCategories.map(c => [c.label.toLowerCase(), c]))
  const incomeColorMap = new Map(incomeCategories.map(c => [c.label, TAILWIND_COLORS[c.color] ?? '#94a3b8']))

  const incomeMap = new Map<string, number>()
  const incomeTxByLabel = new Map<string, Transaction[]>()
  for (const tx of incomeTx) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const cat = incCatById.get(tx.category) ?? incCatByLabel.get(tx.category.toLowerCase())
    const label = cat?.label ?? tx.category ?? 'Other'
    incomeMap.set(label, (incomeMap.get(label) ?? 0) + tx.amount)
    const list = incomeTxByLabel.get(label) ?? []
    list.push(tx)
    incomeTxByLabel.set(label, list)
  }

  const totalIncome = [...incomeMap.values()].reduce((s, v) => s + Math.round(v * 100), 0) / 100

  const incomeLegend = [...incomeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({
      label,
      value: Math.round(amount * 100) / 100,
      percent: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0,
      color: incomeColorMap.get(label) ?? '#94a3b8',
      transactions: (incomeTxByLabel.get(label) ?? []).map(tx => ({ id: tx.id, date: tx.date, name: tx.name, amount: tx.amount }))
    }))

  // --- Expense categories ---
  const ruleById = new Map(expenseCategories.map(r => [String(r.id), r]))
  const ruleByLabel = new Map(expenseCategories.map(r => [r.label.toLowerCase(), r]))
  const expenseColorMap = new Map(expenseCategories.map(r => [r.label, TAILWIND_COLORS[r.color] ?? '#94a3b8']))

  // Allocation per category based on this month's income
  const salaryMap = new Map(expenseCategories.map(c => [
    c.label,
    Math.round(totalIncome * Number(c.percent)) / 100
  ]))

  // Sum actual expenses by category label, match by ID or label string
  const expenseMap = new Map<string, number>()
  const expenseTxByLabel = new Map<string, Transaction[]>()
  for (const tx of expenseTx) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const rule = ruleById.get(tx.category) ?? ruleByLabel.get(tx.category.toLowerCase())
    const label = rule?.label ?? tx.category ?? 'Other'
    expenseMap.set(label, (expenseMap.get(label) ?? 0) + tx.amount)
    const list = expenseTxByLabel.get(label) ?? []
    list.push(tx)
    expenseTxByLabel.set(label, list)
  }

  // Sort by allocated amount descending
  const expenseLabels = [...salaryMap.keys()].sort((a, b) => (salaryMap.get(b) ?? 0) - (salaryMap.get(a) ?? 0))

  const allocated = expenseLabels.map(l => Math.round((salaryMap.get(l) ?? 0) * 100) / 100)
  const spent = expenseLabels.map(l => Math.round((expenseMap.get(l) ?? 0) * 100) / 100)
  const percentSpent = expenseLabels.map((_, i) => {
    const a = allocated[i]
    return a > 0 ? Math.round((spent[i] / a) * 100) : 0
  })

  const totalAllocated = allocated.reduce((s, v) => s + Math.round(v * 100), 0) / 100
  const totalSpent = spent.reduce((s, v) => s + Math.round(v * 100), 0) / 100
  const totalPercent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0

  const expenseCategoryColors = expenseLabels.map(l => expenseColorMap.get(l) ?? '#94a3b8')

  const expenseLegend = expenseLabels.map((l, i) => ({
    label: l,
    value: spent[i],
    percent: percentSpent[i],
    color: expenseCategoryColors[i],
    transactions: (expenseTxByLabel.get(l) ?? []).map(tx => ({ id: tx.id, date: tx.date, name: tx.name, amount: tx.amount }))
  }))

  return {
    title: `Income vs Expenses — ${periodLabel}`,
    subtitle: `Income: ${totalIncome.toFixed(2)} CZK | Spent: ${totalSpent.toFixed(2)} / ${totalAllocated.toFixed(2)} CZK (${totalPercent}%)`,
    navigation: { route: '/api/prompts/income-vs-expenses', month, year },
    type: 'bar',
    labels: expenseLabels.map((l, i) => `${l} (${percentSpent[i]}%)`),
    datasets: [
      {
        label: 'Allocated (CZK)',
        data: allocated,
        backgroundColor: expenseCategoryColors.map(c => `${c}80`)
      },
      {
        label: 'Spent (CZK)',
        data: spent,
        backgroundColor: expenseCategoryColors
      }
    ],
    legendGroups: [
      { label: 'Expenses', items: expenseLegend },
      { label: 'Income', items: incomeLegend }
    ]
  }
})
