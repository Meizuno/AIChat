import { isFileUIPart } from 'ai'
import type { UIMessage } from 'ai'

// Image attachments are stored as bytes in Postgres (no S3). On save we
// offload any base64 data: URL image part to the Attachment table and rewrite
// the part to a small `/api/attachments/{id}` URL, so the messages row stays
// lean. On send we rehydrate those URLs back to data: URLs (scoped to the
// user) so the model — which can't fetch our private, auth-gated route — still
// receives the image inline.

const ATTACHMENT_URL = /^\/api\/attachments\/([0-9a-f-]{36})$/

/** Persist raw bytes, return the new attachment id. */
export async function saveAttachment(
  userId: string,
  data: { mediaType: string, filename?: string, bytes: Buffer }
): Promise<string> {
  const row = await getPrisma().attachment.create({
    data: { user_id: userId, mediaType: data.mediaType, filename: data.filename, bytes: new Uint8Array(data.bytes) },
    select: { id: true }
  })
  return row.id
}

/** Load an attachment's bytes + type, scoped to the owner (null if not theirs). */
export function getAttachment(userId: string, id: string) {
  return getPrisma().attachment.findFirst({
    where: { id, user_id: userId },
    select: { mediaType: true, bytes: true, filename: true }
  })
}

/**
 * Offload base64 image parts to the Attachment table (for persistence).
 * Returns messages with those parts rewritten to `/api/attachments/{id}`.
 */
export async function offloadImages(userId: string, messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(messages.map(async (message) => {
    const parts = await Promise.all(message.parts.map(async (part) => {
      if (!isFileUIPart(part) || !part.mediaType.startsWith('image/') || !part.url.startsWith('data:')) return part
      const match = part.url.match(/^data:([^;]+);base64,(.*)$/s)
      if (!match) return part
      const [, mediaType, base64] = match
      const id = await saveAttachment(userId, {
        mediaType: mediaType!,
        filename: part.filename,
        bytes: Buffer.from(base64!, 'base64')
      })
      return { ...part, url: `/api/attachments/${id}` }
    }))
    return { ...message, parts }
  }))
}

/**
 * Rehydrate `/api/attachments/{id}` image parts back to base64 data: URLs so a
 * follow-up turn on a loaded chat can be sent to the model (which can't reach
 * our auth-gated route). Scoped: an id that isn't the user's is left as-is.
 */
export async function rehydrateImages(userId: string, messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(messages.map(async (message) => {
    const parts = await Promise.all(message.parts.map(async (part) => {
      if (!isFileUIPart(part)) return part
      const match = part.url.match(ATTACHMENT_URL)
      if (!match) return part
      const attachment = await getAttachment(userId, match[1]!)
      if (!attachment) return part
      const base64 = Buffer.from(attachment.bytes).toString('base64')
      return { ...part, url: `data:${attachment.mediaType};base64,${base64}` }
    }))
    return { ...message, parts }
  }))
}
