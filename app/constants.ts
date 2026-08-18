// App-level presentation constants. Previously these lived in config.yml /
// the /api/config payload; now that ai-chat is fully DB- + constant-driven,
// they live here. (Suggested prompts are per-user now — see Settings.)

// Assistant display name + welcome-screen greeting (brand strings).
export const BOT_NAME = 'Meizuno AI'
export const WELCOME_MESSAGE = 'Hello! How can I help you today?'

// Token pricing for the cost readout, matching CHAT_MODEL (gpt-5.6-luna:
// $0.20 in / $1.20 out per 1M tokens). Set undefined to fall back to
// useUsage's built-in price band.
export const PRICING: { inputPerMillion: number, outputPerMillion: number } | undefined = {
  inputPerMillion: 0.20,
  outputPerMillion: 1.20
}
