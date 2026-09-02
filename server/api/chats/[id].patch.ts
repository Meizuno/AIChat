import { getRouterParam } from 'h3'
import { z } from 'zod'

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pinned: z.boolean().optional()
}).refine(d => d.title !== undefined || d.pinned !== undefined, 'nothing to update')

// Update a chat's title and/or pinned flag (scoped to the user).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const chatId = getRouterParam(event, 'id') as string
  const patch = await readValidatedBody(event, updateSchema.parse)
  const count = await updateChat(userId, chatId, patch)
  if (count === 0) throw new NotFound('Chat not found')
  return { ok: true }
})
