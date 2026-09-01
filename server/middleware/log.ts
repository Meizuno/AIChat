import { randomUUID } from 'node:crypto'

// Request logging. Stamps each request with a requestId (also returned as
// x-request-id for client/log correlation), puts it on event.context so
// downstream code can read it without threading it through signatures, and
// emits one inline key=value line per completed request via the logger tool:
//
//   http level=info request-id=… method=GET path=/api/chat response=200 execution=12ms
//
// The level tracks the outcome (5xx → error.log, 4xx → warning.log, else
// info.log). Framework-internal, high-noise endpoints are not logged.
const SKIP_LOG_PREFIXES = ['/api/_mdc/', '/api/_nuxt_icon/']

export default defineEventHandler((event) => {
  const requestId = randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  const path = event.path ?? ''
  if (SKIP_LOG_PREFIXES.some(prefix => path.startsWith(prefix))) return

  const start = Date.now()
  event.node.res.on('finish', () => {
    const status = event.node.res.statusCode
    const fields = {
      'request-id': requestId,
      'method': event.method,
      path,
      'response': status,
      'execution': `${Date.now() - start}ms`
    }
    const log = getLogger()
    if (status >= 500) log.error('http', fields)
    else if (status >= 400) log.warn('http', fields)
    else log.info('http', fields)
  })
})
