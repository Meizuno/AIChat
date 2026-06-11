const MAX_CACHE_SIZE = 20
const cache = new Map<string, string>()
const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''

  // Only cache page requests in production, not API/assets
  if (isDev || path.startsWith('/api/') || path.includes('.')) return

  const cached = cache.get(path)

  if (cached) {
    event.node.res.setHeader('content-type', 'text/html')
    event.node.res.setHeader('x-cache', 'HIT')
    event.node.res.end(cached)
    return
  }

  // Capture the response to cache it. The chunk types here mirror
  // Node's stream signature — string | Buffer | Uint8Array. Using
  // `unknown` keeps us out of the `any` aisle while accepting what
  // Node actually hands us.
  type StreamChunk = string | Buffer | Uint8Array
  const originalEnd = event.node.res.end.bind(event.node.res)
  const chunks: Buffer[] = []

  event.node.res.end = function (chunk?: unknown, ...args: unknown[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as StreamChunk))
    const html = Buffer.concat(chunks).toString('utf-8')
    if (event.node.res.statusCode === 200 && html.length > 0 && cache.size < MAX_CACHE_SIZE) {
      cache.set(path, html)
    }
    return (originalEnd as (...a: unknown[]) => unknown)(chunk, ...args)
  } as typeof event.node.res.end

  const originalWrite = event.node.res.write.bind(event.node.res)
  event.node.res.write = function (chunk: unknown, ...args: unknown[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as StreamChunk))
    return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args)
  } as typeof event.node.res.write

  event.node.res.setHeader('x-cache', 'MISS')
})
