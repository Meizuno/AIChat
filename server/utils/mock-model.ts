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

  // A full markdown + LaTeX showcase so every Prose component and the KaTeX math
  // rendering can be verified in dev. LaTeX backslashes are doubled (JS string
  // escapes); the table avoids `$` so remark-math doesn't misparse it.
  const reply = [
    '# Markdown & LaTeX showcase',
    '',
    'A **mock reply** in _dev mode_ — no OpenAI call, no tokens. It exercises every',
    'Prose component and the math rendering: an [inline link](https://nuxt.com) and',
    'some `inline code`.',
    '',
    '## Heading level 2',
    '',
    '### Heading level 3',
    '',
    '> A blockquote to test ProseBlockquote — with a nested `code` span.',
    '',
    '- Unordered item **one**',
    '- Unordered item two',
    '  - nested a',
    '  - nested b',
    '',
    '1. Ordered first',
    '2. Ordered second',
    '3. Ordered third',
    '',
    '![Meizuno logo](/favicon.svg)',
    '',
    '---',
    '',
    '```ts',
    'export function greet(name: string): string {',
    '  return "Hello, " + name + "!"',
    '}',
    '```',
    '',
    '| Model | Input /1M | Output /1M |',
    '| --- | --- | --- |',
    '| luna | 0.20 | 1.20 |',
    '| terra | 2.00 | 12.00 |',
    '',
    '### Chart',
    '',
    '```chart',
    '{',
    '  "title": "Sample bar chart",',
    '  "unit": "units",',
    '  "data": [',
    '    { "label": "Alpha", "value": 42 },',
    '    { "label": "Beta", "value": 68 },',
    '    { "label": "Gamma", "value": 30 },',
    '    { "label": "Delta", "value": 55 }',
    '  ]',
    '}',
    '```',
    '',
    '### Diagram',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[Rectangle] --> B(Rounded)',
    '  B --> C([Stadium])',
    '  C --> D[[Subroutine]]',
    '  D --> E[(Database)]',
    '  E --> F((Circle))',
    '  F --> G{Decision}',
    '  G -->|yes| H{{Hexagon}}',
    '  G -->|no| I[/Parallelogram/]',
    '  H --> J[/Trapezoid\\]',
    '  I --> K>Flag]',
    '```',
    '',
    'Inline math with dollars: $E = mc^2$, and with parens: \\(a^2 + b^2 = c^2\\).',
    '',
    'Display math (dollars):',
    '',
    '$$',
    '\\int_0^\\infty e^{-x} \\, dx = 1',
    '$$',
    '',
    'Display math (brackets) — Navier–Stokes:',
    '',
    '\\[',
    '\\frac{\\partial \\mathbf{u}}{\\partial t} + (\\mathbf{u}\\cdot \\nabla)\\mathbf{u} = -\\frac{1}{\\rho}\\nabla p + \\nu \\nabla^2 \\mathbf{u} + \\mathbf{f}',
    '\\]'
  ].join('\n')

  // A short reasoning sample so the reasoning panel (UChatReasoning) can be
  // exercised in dev without a reasoning-capable model or API key.
  const reasoning = [
    'The user is running in mock mode, so I have no real model to think with.',
    'I will stream this sample reasoning to exercise the reasoning panel, then',
    'return the canned answer below.'
  ].join(' ')

  // Split on whitespace but keep the separators, so the stream reassembles to
  // the exact text (spaces and newlines included).
  const words = reply.split(/(\s+)/).filter(Boolean)
  const reasoningWords = reasoning.split(/(\s+)/).filter(Boolean)

  // Typed as the provider stream-part union: ReadableStream<T> is invariant in
  // T, so the chunks must match LanguageModelV3StreamPart exactly. Usage uses
  // the v6 nested shape; streamText derives the flat data-usage from it.
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'reasoning-start', id: 'r0' },
    ...reasoningWords.map(word => ({ type: 'reasoning-delta' as const, id: 'r0', delta: word })),
    { type: 'reasoning-end', id: 'r0' },
    { type: 'text-start', id: '0' },
    ...words.map(word => ({ type: 'text-delta' as const, id: '0', delta: word })),
    { type: 'text-end', id: '0' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: words.length + reasoningWords.length, text: words.length, reasoning: reasoningWords.length }
      }
    }
  ]

  return new MockLanguageModelV3({
    // Declare every URL as natively supported so streamText does NOT try to
    // download attachment data: URLs (which it rejects). The mock ignores
    // message content anyway.
    supportedUrls: { '*': [/.*/] },
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
