import { getRouterParam, setResponseHeader } from 'h3'

// Public static serving of chat image blobs from disk (BlobStorage). Lives
// under /media (NOT /api), so the auth middleware does not gate it — access is
// by unguessable key (a UUIDv4), the same capability-URL model as an unlisted
// share link. The key is embedded in the message part on save (offloadImages).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') as string
  const object = await getBlobStorage().get(key)
  if (!object) throw new NotFound('Not found')

  setResponseHeader(event, 'content-type', object.contentType)
  // Stop MIME sniffing and neutralize any script if an SVG is opened directly.
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'content-security-policy', 'default-src \'none\'; sandbox')
  // The key is unique per upload, so the bytes never change under it.
  setResponseHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return object.data
})
