export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const query = getQuery(event)
  return fetchPrompt(event, 'Money Manager', '/api/prompts/finance', {
    month: query.month,
    year: query.year
  })
})
