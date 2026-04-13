import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type SalesSplitRule = { id: number, label: string, percent: number, color: string }
type IncomeCategory = { id: number, label: string, color: string, position: number }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const client = await createMcpClient(event)

  const [rules, incomeCategories] = await Promise.all([
    callMcpTool<SalesSplitRule[]>(client, 'get_expense_categories'),
    callMcpTool<IncomeCategory[]>(client, 'get_income_categories')
  ])

  const expenseSorted = [...rules].sort((a, b) => b.percent - a.percent)
  const totalPercent = expenseSorted.reduce((s, r) => s + Number(r.percent), 0)
  const expenseList = expenseSorted.map(r => `- **${r.label}** — ${r.percent}%`).join('\n')

  const incomeList = [...incomeCategories].sort((a, b) => a.position - b.position).map(c => `- **${c.label}**`).join('\n')

  const note = totalPercent === 100
    ? `> Total split: **${totalPercent}%** — fully allocated`
    : totalPercent < 100
      ? `> Total split: **${totalPercent}%** — **${100 - totalPercent}%** unallocated`
      : `> Total split: **${totalPercent}%** — over-allocated by **${totalPercent - 100}%**`

  return { text: `**Expense categories**\n\n${expenseList}\n\n${note}\n\n**Income categories**\n\n${incomeList}` }
})
