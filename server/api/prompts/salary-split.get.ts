import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type ExpenseCategory = { id: number, label: string, percent: number, color: string }

const COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

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

  const [incomeTx, categories] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'income', dateFrom, dateTo }),
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories')
  ])

  const totalIncome = incomeTx
    .filter(tx => !tx.currency || tx.currency === 'CZK')
    .reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0) / 100

  const entries = categories
    .map((c, i) => ({
      label: c.label,
      percent: Number(c.percent),
      amount: Math.round(totalIncome * Number(c.percent)) / 100,
      color: COLORS[i % COLORS.length]
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    title: `Salary split — ${periodLabel}`,
    navigation: { route: '/api/prompts/salary-split', month, year },
    type: 'pie',
    labels: entries.map(r => `${r.label} (${r.percent}%)`),
    datasets: [{
      label: 'Amount (CZK)',
      data: entries.map(r => r.amount),
      backgroundColor: entries.map(r => r.color)
    }]
  }
})
