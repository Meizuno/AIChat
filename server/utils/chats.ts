import type { Prisma } from '@prisma/client'
import { Unauthorized } from './errors'

// Scoped data-access for chat history. Every function takes the SSO `userId`
// (from viewerId(event)) and filters by it — a user can only ever touch their
// own chats. This is the persistence seam ai-chat previously did without;
// keep HTTP concerns (status codes) out of here, throw typed domain errors.

/** List a user's chats, newest-first. Titles + timestamps only (no messages). */
export function listChats(userId: string) {
  return getPrisma().chat.findMany({
    where: { user_id: userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true }
  })
}

/** Fetch one chat with its messages in order, or null if not the user's. */
export function getChat(userId: string, chatId: string) {
  return getPrisma().chat.findFirst({
    where: { id: chatId, user_id: userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  })
}

/** Create an empty chat for a user. */
export function createChat(userId: string, title = 'New chat') {
  return getPrisma().chat.create({
    data: { user_id: userId, title }
  })
}

/** Rename a chat (scoped). Returns the update count (0 = not the user's). */
export async function renameChat(userId: string, chatId: string, title: string) {
  const { count } = await getPrisma().chat.updateMany({
    where: { id: chatId, user_id: userId },
    data: { title }
  })
  return count
}

/** Delete a chat and its messages (cascade). Returns the delete count. */
export async function deleteChat(userId: string, chatId: string) {
  const { count } = await getPrisma().chat.deleteMany({
    where: { id: chatId, user_id: userId }
  })
  return count
}

/**
 * Ensure a chat row exists for (userId, chatId) — the client picks the id, so
 * this upserts it on the first message. Guards ownership: if the id already
 * belongs to a *different* user, reject rather than hijack it.
 */
export async function ensureChat(userId: string, chatId: string, title: string) {
  const db = getPrisma()
  const existing = await db.chat.findUnique({ where: { id: chatId }, select: { user_id: true } })
  if (existing) {
    if (existing.user_id !== userId) throw new Unauthorized()
    return
  }
  await db.chat.create({ data: { id: chatId, user_id: userId, title: title.slice(0, 200) || 'New chat' } })
}

/**
 * Replace a chat's messages with the full list from a completed turn (the AI
 * SDK's onFinish gives the whole updated conversation). Rewriting wholesale
 * keeps history consistent across regenerates/edits without dedup logic — the
 * message counts here are small. Scoped: no-op if the chat isn't the user's.
 */
export async function saveChatMessages(
  userId: string,
  chatId: string,
  messages: Array<{ role: string, parts: unknown }>
) {
  const db = getPrisma()
  const owned = await db.chat.findFirst({ where: { id: chatId, user_id: userId }, select: { id: true } })
  if (!owned) return

  await db.$transaction([
    db.message.deleteMany({ where: { chat_id: chatId } }),
    db.message.createMany({
      data: messages.map(m => ({
        chat_id: chatId,
        role: m.role,
        parts: (m.parts ?? []) as Prisma.InputJsonValue
      }))
    }),
    db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
  ])
}
