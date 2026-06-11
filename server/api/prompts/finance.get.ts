import { financePromptQuerySchema } from '#shared/schemas/prompt'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, financePromptQuerySchema.parse)
  return fetchPromptThrough(event, 'Money Manager', '/api/prompts/finance', query)
})
