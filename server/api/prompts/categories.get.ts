import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type ExpenseCategory = { id: number, label: string, percent: number, color: string }
type IncomeCategory = { id: number, label: string, color: string, position: number }

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

  const [expenseCategories, incomeCategories, incomeTx] = await Promise.all([
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories'),
    callMcpTool<IncomeCategory[]>(client, 'get_income_categories'),
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'income', dateFrom, dateTo })
  ])

  // Total income (CZK only)
  const incCatById = new Map(incomeCategories.map(c => [String(c.id), c]))
  const incCatByLabel = new Map(incomeCategories.map(c => [c.label.toLowerCase(), c]))

  const incomeByCategory = new Map<string, number>()
  for (const tx of incomeTx) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const cat = incCatById.get(tx.category) ?? incCatByLabel.get(tx.category.toLowerCase())
    const label = cat?.label ?? tx.category ?? 'Other'
    incomeByCategory.set(label, (incomeByCategory.get(label) ?? 0) + tx.amount)
  }

  const totalIncome = [...incomeByCategory.values()].reduce((s, v) => s + Math.round(v * 100), 0) / 100
  const totalPercent = expenseCategories.reduce((s, r) => s + Number(r.percent), 0)

  return {
    component: 'categories',
    navigation: { route: '/api/prompts/categories', month, year },
    periodLabel,
    totalIncome,
    totalPercent,
    expense: expenseCategories
      .sort((a, b) => b.percent - a.percent)
      .map(c => ({
        ...c,
        percent: Number(c.percent),
        amount: Math.round(totalIncome * Number(c.percent)) / 100
      })),
    income: incomeCategories
      .sort((a, b) => a.position - b.position)
      .map(c => ({
        ...c,
        amount: Math.round((incomeByCategory.get(c.label) ?? 0) * 100) / 100
      }))
  }
})
