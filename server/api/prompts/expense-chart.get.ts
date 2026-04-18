export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const query = getQuery(event)
  return fetchPrompt(event, 'Money Manager', '/api/prompts/expense-chart', {
    month: query.month,
    year: query.year
  })
})
