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

  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  const client = await createMcpClient(event)

  const [transactions, rules] = await Promise.all([
    callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'expense', dateFrom, dateTo }),
    callMcpTool<SalesSplitRule[]>(client, 'get_sales_split')
  ])

  const ruleMap = new Map(rules.map(r => [String(r.id), r.label]))

  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.currency && tx.currency !== 'CZK') continue
    const label = ruleMap.get(tx.category) ?? tx.category ?? 'Other'
    totals.set(label, (totals.get(label) ?? 0) + tx.amount)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  return {
    title: `Expenses by category — ${now.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
    type: 'pie',
    labels: sorted.map(([label]) => label),
    datasets: [{
      label: 'Amount (CZK)',
      data: sorted.map(([, amount]) => Math.round(amount * 100) / 100),
      backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length])
    }]
  }
})
