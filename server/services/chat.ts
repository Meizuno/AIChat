import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, isTextUIPart } from 'ai'
import type { LanguageModel, UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { H3Event } from 'h3'
import type { ChatBody } from '#shared/schemas/chat'

// Cap on the tool-calling loop. Users add their own MCP servers at runtime, so
// the tool count is unbounded and a multi-server task can hit this — when it
// does we tell the client rather than ending silently (see below).
const STEP_LIMIT = 5

// Derive a chat title from the first user message's text (truncated).
function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  const text = (firstUser?.parts ?? [])
    .filter(part => isTextUIPart(part))
    .map(part => part.text)
    .join(' ')
    .trim()
  return text.slice(0, 80) || 'New chat'
}

// Use-case for /api/chat. Builds the OpenAI client + tool set, kicks
// off a streamed completion, and wraps it in a `data-usage` envelope
// the client uses for the token-cost readout. Connection lifetime is
// managed by the pooled MCP client (see server/utils/mcp-client) so
// the stream callback doesn't close anything.
export async function streamChatResponse(event: H3Event, body: ChatBody) {
  const { id: userId } = await requireAuthUser(event)

  // Persistence is opt-in: only when the client sends a chat id. Ensure the
  // chat row exists (ownership-guarded) before streaming; the completed turn
  // is saved in onFinish below.
  const originalMessages = body.messages as UIMessage[]
  const chatId = body.id
  if (chatId) await ensureChat(userId, chatId, deriveTitle(originalMessages))

  const { openaiApiKey, mockAi } = useRuntimeConfig(event)

  // Dev short-circuit: a mock model streams a canned reply and no MCP tools
  // are wired (nothing to call), keeping local chat fully offline.
  const useMock = ['1', 'true', 'yes'].includes(String(mockAi).toLowerCase())
  let model: LanguageModel
  if (useMock) {
    model = await createMockModel()
  } else {
    const openaiModel = createOpenAI({ apiKey: openaiApiKey })(CHAT_MODEL)
    // The OpenAI provider lists only http(s) image URLs as supported, so the
    // AI SDK tries to HTTP-download data: URL image attachments and throws.
    // The OpenAI API accepts data URLs inline, so mark them supported to skip
    // the download and pass them straight through.
    openaiModel.supportedUrls = { 'image/*': [/^https?:\/\//, /^data:image\//] }
    model = openaiModel
  }
  const tools = useMock ? undefined : await getChatTools(event)

  // Append the user's configured profile (a public llms.txt-style page set in
  // their settings) so the assistant knows who it works for. It's a remote,
  // mutable document, so it's fenced as an explicitly-untrusted block (see
  // wrapUserProfile + SYSTEM_PROMPT) rather than given system authority. No-op
  // if unset or it can't be fetched.
  const basePrompt = SYSTEM_PROMPT.replace('{date}', new Date().toISOString().slice(0, 10))
  const profileUrl = await getUserProfileUrl(userId)
  const profile = await fetchProfile(profileUrl)
  const systemPrompt = profile
    ? `${basePrompt}\n\n${wrapUserProfile(profile, profileUrl)}`
    : basePrompt

  // Rehydrate any stored `/api/attachments/{id}` image parts back to data URLs
  // (no-op for fresh turns, which already carry data URLs) so the model gets
  // the image inline — it can't fetch our private, auth-gated route.
  const modelMessages = await rehydrateImages(userId, originalMessages)

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(modelMessages as Parameters<typeof convertToModelMessages>[0]),
    tools,
    stopWhen: stepCountIs(STEP_LIMIT),
    // Ask OpenAI reasoning models to stream a summary of their reasoning so the
    // UI can show it live. Namespaced by provider → a no-op for the mock model;
    // only reasoning-capable models actually emit it.
    providerOptions: { openai: { reasoningSummary: 'auto' } }
  })

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages,
      async execute({ writer }) {
        // sendReasoning forwards reasoning parts to the client (the reasoning
        // panel); they are not persisted (onFinish stores text/tool parts).
        writer.merge(result.toUIMessageStream({ sendReasoning: true }))
        const usage = await result.usage
        writer.write({ type: 'data-usage', data: usage } as never)

        // If the run stopped because the step budget was exhausted — the model
        // still wanted to call tools at the cap — surface it to the client
        // (same transient data-part channel as the usage envelope) so the run
        // doesn't just end with no explanation.
        const [finishReason, steps] = await Promise.all([result.finishReason, result.steps])
        if (finishReason === 'tool-calls' && steps.length >= STEP_LIMIT) {
          writer.write({ type: 'data-notice', data: { kind: 'step-limit', limit: STEP_LIMIT } } as never)
        }
      },
      // The completed turn (original + new assistant message) is persisted
      // wholesale to the chat. Image data URLs are offloaded to the Attachment
      // table first so the messages row stays small. No-op without a chat id.
      onFinish: async ({ messages }) => {
        if (!chatId) return
        const toStore = await offloadImages(userId, messages)
        await saveChatMessages(userId, chatId, toStore)
      }
    })
  })
}
