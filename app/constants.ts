// App-level presentation constants. Previously these lived in config.yml /
// the /api/config payload; now that ai-chat is fully DB- + constant-driven,
// they live here. (Suggested prompts are per-user now — see Settings.)

// Assistant display name + welcome-screen greeting (brand strings).
export const BOT_NAME = 'Meizuno AI'
export const WELCOME_MESSAGE = 'Hello! How can I help you today?'

// Optional token pricing for the cost readout. Leave undefined to fall back to
// useUsage's built-in price band; set to enable an exact per-model estimate.
export const PRICING: { inputPerMillion: number, outputPerMillion: number } | undefined = undefined
