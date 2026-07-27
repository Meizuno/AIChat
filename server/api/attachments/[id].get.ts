import { getRouterParam, setResponseHeader } from 'h3'

// Serve an attachment's bytes, scoped to the signed-in owner. Rendered by the
// browser via <img src="/api/attachments/{id}"> with the SSO cookie, so the
// auth middleware gates it. Bytes live in Postgres (no S3).
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireAuthUser(event)
  const id = getRouterParam(event, 'id') as string
  const attachment = await getAttachment(userId, id)
  if (!attachment) throw new NotFound('Attachment not found')

  setResponseHeader(event, 'content-type', attachment.mediaType)
  setResponseHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
  return Buffer.from(attachment.bytes)
})
