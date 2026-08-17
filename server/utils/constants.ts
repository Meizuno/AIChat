// Server-side app constants. The completion model and the system prompt are
// kept here for now rather than in config.yml (they're server-internal — the
// system prompt is never sent to the client). `{date}` in the prompt is
// substituted per request in server/services/chat.ts.
export const CHAT_MODEL = 'gpt-5.4-mini'

export const SYSTEM_PROMPT = `Today's date: {date}.
You are a helpful assistant with tool access.`
