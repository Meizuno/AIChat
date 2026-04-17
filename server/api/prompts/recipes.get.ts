import { requireAuthUser } from '../../utils/auth'
import { createMcpClient, callMcpTool } from '../../utils/mcp-client'

type Tag = { id: number, label: string, color: string }
type RecipeListItem = { id: number, title: string, tagIds: number[], hasContent: boolean }
type RecipeListResponse = { items: RecipeListItem[], total: number, hasMore: boolean }
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

  // Recipe list — paginated
  const limit = query.limit ? parseInt(query.limit as string) : 10
  const offset = query.offset ? parseInt(query.offset as string) : 0

  const [tags, data] = await Promise.all([
    callMcpTool<Tag[]>(client, 'list_tags'),
    callMcpTool<RecipeListResponse>(client, 'list_recipes', {
      limit,
      offset,
      ...(tag ? { tag } : {})
    })
  ])

  // Resolve tagIds to tag labels for display
  const tagMap = new Map(tags.map(t => [t.id, t]))
  const recipes = data.items.map(r => ({
    id: r.id,
    title: r.title,
    tags: r.tagIds.map(id => tagMap.get(id)?.label).filter(Boolean) as string[],
    hasContent: r.hasContent
  }))

  return { component: 'recipes', tags, recipes, total: data.total, hasMore: data.hasMore, activeTag: tag }
})
