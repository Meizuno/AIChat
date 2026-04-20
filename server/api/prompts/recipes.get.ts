export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const query = getQuery(event)
  return fetchPrompt(event, 'Recipes Book', '/api/prompts/recipes', {
    id: query.id,
    tag: query.tag,
    search: query.search,
    limit: query.limit,
    offset: query.offset
  })
})
