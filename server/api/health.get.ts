import { existsSync } from 'node:fs'

// Public health endpoint. No auth required (allow-listed in `auth.ts`).
// Used by the Docker HEALTHCHECK directive, Traefik's load-balancer
// healthcheck, and any external monitor.
//
// Keep it cheap — no DB calls, no external service hops. The point is
// to answer "is the HTTP layer up?" with as little latency as possible.
//
// Drain: during a rolling deploy, docker-rollout's `--pre-stop-hook` touches
// this file in the OLD container before stopping it. We then report 503 so
// Traefik's load-balancer healthcheck pulls this replica from the pool and
// in-flight requests drain to the already-healthy new replica — real
// zero-downtime. A fresh container has an empty /tmp, so it never starts drained.
const DRAIN_FILE = '/tmp/drain'

export default defineEventHandler((event) => {
  if (existsSync(DRAIN_FILE)) {
    setResponseStatus(event, 503)
    return { status: 'draining' }
  }
  return { status: 'ok' }
})
