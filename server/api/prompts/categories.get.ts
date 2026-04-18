import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type ExpenseCategory = { id: number, label: string, percent: number, color: string }
type IncomeCategory = { id: number, label: string, color: string, position: number }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const client = await createMcpClient(event)

  const [expenseCategories, incomeCategories] = await Promise.all([
    callMcpTool<ExpenseCategory[]>(client, 'get_expense_categories'),
    callMcpTool<IncomeCategory[]>(client, 'get_income_categories')
  ])

  const totalPercent = expenseCategories.reduce((s, r) => s + Number(r.percent), 0)

  return {
    component: 'categories',
    expense: expenseCategories.sort((a, b) => b.percent - a.percent),
    income: incomeCategories.sort((a, b) => a.position - b.position),
    totalPercent
  }
})
