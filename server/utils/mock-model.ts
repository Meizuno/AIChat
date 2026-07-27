import type { LanguageModel } from 'ai'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'

// Dev-only stand-in for the OpenAI model. Streams a canned markdown reply
// word-by-word so the chat UI, the streaming path, and the `data-usage`
// envelope all exercise the real code with no API key, network, or token
// spend. Gated by runtimeConfig.mockAi (NUXT_MOCK_AI) — never used in prod.
//
// `ai/test` is imported dynamically so the mock utilities are pulled into the
// bundle only when mock mode is actually enabled.
export async function createMockModel(): Promise<LanguageModel> {
  const { MockLanguageModelV3, simulateReadableStream } = await import('ai/test')

  const reply = [
    '**Mock AI — dev mode.** This reply is generated locally by a mock model,',
    'so no OpenAI request was made and no tokens were spent.',
    '',
    'Streaming, Markdown rendering, and the token-usage readout all run through',
    'the real code paths — only the model is swapped. Set `NUXT_MOCK_AI=` (empty)',
    'to talk to OpenAI again.'
  ].join(' ')

  // Split on whitespace but keep the separators, so the stream reassembles to
  // the exact text (spaces and newlines included).
  const words = reply.split(/(\s+)/).filter(Boolean)

  // Typed as the provider stream-part union: ReadableStream<T> is invariant in
  // T, so the chunks must match LanguageModelV3StreamPart exactly. Usage uses
  // the v6 nested shape; streamText derives the flat data-usage from it.
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'text-start', id: '0' },
    ...words.map(word => ({ type: 'text-delta' as const, id: '0', delta: word })),
    { type: 'text-end', id: '0' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: words.length, text: words.length, reasoning: 0 }
      }
    }
  ]

  return new MockLanguageModelV3({
    doStream: async () => ({
      // 1s before the first chunk so the "thinking" indicator is visible,
      // then stream the words quickly.
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        initialDelayInMs: 1000,
        chunkDelayInMs: 30,
        chunks
      })
    })
  })
}
