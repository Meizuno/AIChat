import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Transaction = { id: number, date: string, name: string, amount: number, currency: string | null, type: string, category: string }
type SalesSplitRule = { id: number, label: string, percent: number, color: string }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const client = await createMcpClient(event)

  try {
    const [rules, incomes] = await Promise.all([
      callMcpTool<SalesSplitRule[]>(client, 'get_sales_split'),
      callMcpTool<Transaction[]>(client, 'list_transactions', { type: 'income' })
    ])

    const expenseSorted = [...rules].sort((a, b) => b.percent - a.percent)
    const expenseList = expenseSorted.map(r => `- **${r.label}** — ${r.percent}%`).join('\n')

    const ruleMap = new Map(rules.map(r => [String(r.id), r.label]))
    const incomeCategories = [...new Set(incomes.map(tx => ruleMap.get(tx.category) ?? tx.category ?? 'Other'))].sort()
    const incomeList = incomeCategories.map(c => `- **${c}**`).join('\n')

    return { text: `**Expense categories**\n\n${expenseList}\n\n**Income categories**\n\n${incomeList}` }
  }
  finally {
    await client.close()
  }
})
