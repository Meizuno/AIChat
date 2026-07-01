import { getConfig } from '../utils/mcp-config'

// Fail-fast config validation. Loads + validates config.yml once at server
// startup; if it is missing/invalid the process exits immediately instead of
// silently running on defaults and surfacing the problem as "no MCP tools / no
// prompts / wrong model" much later. Pairs with docker rollout: a bad config
// means the new container never becomes healthy, so the old one keeps serving.
export default defineNitroPlugin(() => {
  // `nuxt build` prerendering boots a throwaway Nitro instance without the
  // runtime-mounted config.yml — validation is a real-startup concern only.
  if (import.meta.prerender) return

  try {
    getConfig()
  } catch (err) {
    console.error('[config] Invalid config.yml — refusing to start:')
    console.error((err as Error).message)
    process.exit(1)
  }
})
