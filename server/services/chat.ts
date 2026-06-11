import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { H3Event } from 'h3'
import type { ChatBody } from '#shared/schemas/chat'

// Use-case for /api/chat. Builds the OpenAI client + tool set, kicks
// off a streamed completion, and wraps it in a `data-usage` envelope
// the client uses for the token-cost readout. Connection lifetime is
// managed by the pooled MCP client (see server/utils/mcp-client) so
// the stream callback doesn't close anything.
export async function streamChatResponse(event: H3Event, body: ChatBody) {
  await requireAuthUser(event)

  const { openaiApiKey } = useRuntimeConfig(event)
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const tools = await getChatTools(event)

  const systemPrompt = getConfig().systemPrompt.replace('{date}', new Date().toISOString().slice(0, 10))

  const result = streamText({
    model: openai('gpt-5.4-nano'),
    system: systemPrompt,
    messages: await convertToModelMessages(body.messages as Parameters<typeof convertToModelMessages>[0]),
    tools,
    stopWhen: stepCountIs(5)
  })

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        writer.merge(result.toUIMessageStream())
        const usage = await result.usage
        writer.write({ type: 'data-usage', data: usage } as never)
      }
    })
  })
}
