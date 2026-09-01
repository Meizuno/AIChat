import { isFileUIPart } from 'ai'
import type { UIMessage } from 'ai'

// Chat image attachments live on disk via BlobStorage (getBlobStorage), not in
// Postgres. On save we offload any base64 data: URL image part to the blob
// store and rewrite the part to a small, public `/media/{key}` URL, so the
// messages row stays lean. On send we rehydrate those URLs back to data: URLs
// so the model still receives the image inline (independent of whether our
// public host is reachable from the provider). On chat delete we collect the
// keys from the stored parts so the files can be removed (see removeChat).

const MEDIA_URL = /^\/media\/([0-9a-f-]{36}\.[a-z0-9]{1,5})$/

/**
 * Offload base64 image parts to the blob store (for persistence).
 * Returns messages with those parts rewritten to `/media/{key}`.
 */
export async function offloadImages(messages: UIMessage[]): Promise<UIMessage[]> {
  const blob = getBlobStorage()
  return Promise.all(messages.map(async (message) => {
    const parts = await Promise.all(message.parts.map(async (part) => {
      if (!isFileUIPart(part) || !part.mediaType.startsWith('image/') || !part.url.startsWith('data:')) return part
      const match = part.url.match(/^data:([^;]+);base64,(.*)$/s)
      if (!match) return part
      const [, mediaType, base64] = match
      const key = await blob.put({ contentType: mediaType!, data: Buffer.from(base64!, 'base64') })
      return { ...part, url: `/media/${key}` }
    }))
    return { ...message, parts }
  }))
}

/**
 * Rehydrate `/media/{key}` image parts back to base64 data: URLs so a follow-up
 * turn on a loaded chat can be sent to the model inline. A key that no longer
 * resolves is left as-is.
 */
export async function rehydrateImages(messages: UIMessage[]): Promise<UIMessage[]> {
  const blob = getBlobStorage()
  return Promise.all(messages.map(async (message) => {
    const parts = await Promise.all(message.parts.map(async (part) => {
      if (!isFileUIPart(part)) return part
      const match = part.url.match(MEDIA_URL)
      if (!match) return part
      const object = await blob.get(match[1]!)
      if (!object) return part
      const base64 = object.data.toString('base64')
      return { ...part, url: `data:${object.contentType};base64,${base64}` }
    }))
    return { ...message, parts }
  }))
}

/**
 * Collect the blob keys referenced by a chat's stored messages, so the files
 * can be deleted when the chat is. Parts come straight from Postgres (opaque
 * JSON), so this narrows defensively.
 */
export function collectAttachmentKeys(messages: Array<{ parts: unknown }>): string[] {
  const keys: string[] = []
  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (const part of parts) {
      const url = (part as { url?: unknown })?.url
      if (typeof url !== 'string') continue
      const match = url.match(MEDIA_URL)
      if (match) keys.push(match[1]!)
    }
  }
  return keys
}

/** Best-effort removal of a set of blob keys from the store. */
export async function deleteAttachments(keys: string[]): Promise<void> {
  const blob = getBlobStorage()
  await Promise.all(keys.map(key => blob.delete(key)))
}
