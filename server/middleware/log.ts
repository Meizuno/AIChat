export default defineEventHandler((event) => {
  const path = event.path

  const start = Date.now()
  event.node.res.on('finish', () => {
    const ms = Date.now() - start
    const status = event.node.res.statusCode
    console.log(`[${event.method}] ${path} → ${status} (${ms}ms)`)
  })
})
