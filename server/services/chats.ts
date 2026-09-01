// Chat-deletion use case. deleteChat (data-access) only knows Postgres, but a
// chat's image bytes live on disk (BlobStorage). So the cleanup is orchestrated
// here: read the chat's stored parts, collect the blob keys, remove the files,
// then delete the rows. Scoped by userId throughout — a chat that is not the
// user's is a no-op (returns 0).
export async function removeChat(userId: string, chatId: string): Promise<number> {
  const chat = await getChat(userId, chatId)
  if (!chat) return 0
  await deleteAttachments(collectAttachmentKeys(chat.messages))
  return deleteChat(userId, chatId)
}
