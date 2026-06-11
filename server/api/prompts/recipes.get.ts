import { recipesPromptQuerySchema } from '#shared/schemas/prompt'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, recipesPromptQuerySchema.parse)
  return fetchPromptThrough(event, 'Recipes Book', '/api/prompts/recipes', query)
})
