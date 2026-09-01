import { isFileUIPart, isTextUIPart } from 'ai'
import type { UIMessage } from 'ai'

// Server-owned context window. Because LLM APIs are stateless, the whole
// conversation is resent to the model on every turn — so without a bound the
// per-turn token cost, and eventually the model's context window, grow without
// limit. windowMessages keeps the most recent messages that fit a token budget
// and drops the oldest. It is lossless within the window and costs no extra
// model call (unlike summarization, which can layer on top of this later to
// compress the dropped prefix). The system prompt is added separately in the
// chat service and is not subject to this budget.

// Rough ceiling for the history sent to the model, in tokens. Generous enough
// that normal chats are never trimmed; small enough to cap a runaway thread.
export const CONTEXT_TOKEN_BUDGET = 12_000

// Cheap, dependency-free token estimate: ~4 characters per token for text, plus
// a flat per-image cost (image tokens are model-specific; this is deliberately
// generous so the window errs toward keeping fewer images). Precision is not
// needed — this only decides where to cut the history, not billing.
const CHARS_PER_TOKEN = 4
const IMAGE_TOKEN_COST = 1_200

export function estimateMessageTokens(message: UIMessage): number {
  let chars = 0
  let images = 0
  for (const part of message.parts) {
    if (isTextUIPart(part)) chars += part.text.length
    else if (isFileUIPart(part) && part.mediaType.startsWith('image/')) images++
  }
  return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKEN_COST
}

/**
 * Keep the most recent messages that fit `budget`, dropping the oldest. The
 * newest message is always kept even if it alone exceeds the budget — the
 * current turn must reach the model. Whole messages only; a full assistant turn
 * (its tool calls + results live in one message) is never split.
 */
export function windowMessages(messages: UIMessage[], budget = CONTEXT_TOKEN_BUDGET): UIMessage[] {
  if (messages.length <= 1) return messages
  const kept: UIMessage[] = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i]!)
    if (kept.length > 0 && total + cost > budget) break
    kept.push(messages[i]!)
    total += cost
  }
  return kept.reverse()
}
