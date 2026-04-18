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

  // Capture the response to cache it
  const originalEnd = event.node.res.end.bind(event.node.res)
  const chunks: Buffer[] = []

  event.node.res.end = function (chunk?: any, ...args: any[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const html = Buffer.concat(chunks).toString('utf-8')
    if (event.node.res.statusCode === 200 && html.length > 0) {
      cache.set(path, html)
    }
    return originalEnd(chunk, ...args)
  } as any

  const originalWrite = event.node.res.write.bind(event.node.res)
  event.node.res.write = function (chunk: any, ...args: any[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return originalWrite(chunk, ...args)
  } as any

  event.node.res.setHeader('x-cache', 'MISS')
})
