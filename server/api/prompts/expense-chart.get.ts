import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type SalesSplitRule = { id: number, label: string, percent: number, color: string }

const COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const query = getQuery(event)
  const now = new Date()
  const month = query.month ? parseInt(query.month as string) : now.getMonth() + 1
  const year = query.year ? parseInt(query.year as string) : now.getFullYear()

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = new Date(year, month, 0).toISOString().slice(0, 10)

  const client = await createMcpClient(event)

  const [transactions, rules] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<SalesSplitRule[]>(client, 'get_expense_categories')
  ])

  const ruleById = new Map(rules.map(r => [String(r.id), r.label]))
  const ruleByLabel = new Map(rules.map(r => [r.label.toLowerCase(), r.label]))

  const totals = new Map<string, number>()
  const txByLabel = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const label = ruleById.get(tx.category)
      ?? ruleByLabel.get(tx.category.toLowerCase())
      ?? tx.category
      ?? 'Other'
    totals.set(label, (totals.get(label) ?? 0) + tx.amount)
    const list = txByLabel.get(label) ?? []
    list.push(tx)
    txByLabel.set(label, list)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((s, [, v]) => s + v, 0)

  return {
    title: `Expenses by category — ${new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}`,
    navigation: { route: '/api/prompts/expense-chart', month, year },
    type: 'pie',
    labels: sorted.map(([label]) => label),
    datasets: [{
      label: 'Amount (CZK)',
      data: sorted.map(([, amount]) => Math.round(amount * 100) / 100),
      backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length])
    }],
    legend: sorted.map(([label, amount], i) => ({
      label,
      value: Math.round(amount * 100) / 100,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: COLORS[i % COLORS.length],
      transactions: (txByLabel.get(label) ?? []).map(tx => ({ id: tx.id, date: tx.date, name: tx.name, amount: tx.amount }))
    }))
  }
})
