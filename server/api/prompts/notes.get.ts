export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const query = getQuery(event)
  return fetchPrompt(event, 'Knowledge Base', '/api/prompts/notes', {
    id: query.id,
    folder: query.folder,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
    view: query.view
  })
})
