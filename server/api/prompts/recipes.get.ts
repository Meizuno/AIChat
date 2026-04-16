import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Tag = { id: number, label: string, color: string }
type RecipeListItem = { id: number, title: string, tags: string[], hasContent: boolean }
type RecipeFull = { id: number, title: string, content: string, tags: string[], updated_at: string }

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const query = getQuery(event)
  const recipeId = query.id ? parseInt(query.id as string) : null
  const tag = query.tag ? String(query.tag) : ''

  const client = await createMcpClient(event, 'Recipes Book')

  // Single recipe detail
  if (recipeId) {
    const recipe = await callMcpTool<RecipeFull>(client, 'get_recipe', { id: recipeId })
    return { component: 'recipe-detail', recipe }
  }

  // Recipe list
  const [tags, recipes] = await Promise.all([
    callMcpTool<Tag[]>(client, 'list_tags'),
    callMcpTool<RecipeListItem[]>(client, 'list_recipes', tag ? { tag } : {})
  ])

  return { component: 'recipes', tags, recipes, activeTag: tag }
})
