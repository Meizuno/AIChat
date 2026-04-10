import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type SalesSplitPreview = {
  totalIncome: number
  totalAllocatedPercent: number
  unallocatedPercent: number
  unallocatedAmount: number
  categories: { id: number, label: string, percent: number, amount: number }[]
}

const COLORS = [
  '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
]

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const client = await createMcpClient(event)

  const preview = await callMcpTool<SalesSplitPreview>(client, 'get_expense_category_preview')

  const now = new Date()
  const entries = [...preview.categories].sort((a, b) => b.amount - a.amount)

  if (preview.unallocatedAmount > 0) {
    entries.push({ id: -1, label: 'Unallocated', percent: preview.unallocatedPercent, amount: preview.unallocatedAmount })
  }

  return {
    title: `Salary split — ${now.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
    type: 'pie',
    labels: entries.map(r => `${r.label} (${r.percent}%)`),
    datasets: [{
      label: 'Amount (CZK)',
      data: entries.map(r => Math.round(r.amount * 100) / 100),
      backgroundColor: entries.map((_, i) => COLORS[i % COLORS.length])
    }]
  }
})
