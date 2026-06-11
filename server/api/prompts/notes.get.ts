import { notesPromptQuerySchema } from '#shared/schemas/prompt'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, notesPromptQuerySchema.parse)
  return fetchPromptThrough(event, 'Notes', '/api/prompts/notes', query)
})
