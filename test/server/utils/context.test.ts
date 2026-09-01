import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { estimateMessageTokens, windowMessages } from '../../../server/utils/context'

// Build a UIMessage whose text is `chars` long (drives the token estimate).
function textMsg(id: string, role: 'user' | 'assistant', chars: number): UIMessage {
  return { id, role, parts: [{ type: 'text', text: 'x'.repeat(chars) }] } as UIMessage
}

function imageMsg(id: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'file', mediaType: 'image/png', url: '/media/x.png' }] } as UIMessage
}

describe('estimateMessageTokens', () => {
  it('counts ~4 chars per token for text', () => {
    expect(estimateMessageTokens(textMsg('a', 'user', 40))).toBe(10)
  })

  it('adds a flat cost per image', () => {
    expect(estimateMessageTokens(imageMsg('a'))).toBe(1_200)
  })
})

describe('windowMessages', () => {
  it('returns short conversations unchanged', () => {
    const msgs = [textMsg('a', 'user', 8), textMsg('b', 'assistant', 8)]
    expect(windowMessages(msgs, 1_000)).toEqual(msgs)
  })

  it('drops the oldest messages past the budget, keeping the newest', () => {
    // Each message ~25 tokens (100 chars). Budget 60 → keeps the last 2.
    const msgs = [
      textMsg('old', 'user', 100),
      textMsg('mid', 'assistant', 100),
      textMsg('new', 'user', 100)
    ]
    const kept = windowMessages(msgs, 60)
    expect(kept.map(m => m.id)).toEqual(['mid', 'new'])
  })

  it('always keeps the final message even if it alone exceeds the budget', () => {
    const msgs = [textMsg('old', 'user', 40), textMsg('huge', 'user', 10_000)]
    const kept = windowMessages(msgs, 100)
    expect(kept.map(m => m.id)).toEqual(['huge'])
  })

  it('preserves chronological order in the kept window', () => {
    // 4 messages × ~10 tokens (40 chars) = 40 ≤ budget → all kept, in order.
    const msgs = Array.from({ length: 4 }, (_, i) => textMsg(`m${i}`, i % 2 ? 'assistant' : 'user', 40))
    const kept = windowMessages(msgs, 100)
    expect(kept.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3'])
  })
})
