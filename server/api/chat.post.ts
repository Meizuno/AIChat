import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { messages } = await readBody(event)
  const { openaiApiKey } = useRuntimeConfig(event)
  const openai = createOpenAI({ apiKey: openaiApiKey })

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages)
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
})
