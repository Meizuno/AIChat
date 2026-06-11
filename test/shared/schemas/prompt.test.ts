import { describe, it, expect } from 'vitest'
import {
  financePromptQuerySchema,
  notesPromptQuerySchema,
  recipesPromptQuerySchema
} from '../../../shared/schemas/prompt'

describe('prompt query schemas', () => {
  it('finance accepts month/year as digit strings', () => {
    const r = financePromptQuerySchema.safeParse({ month: '3', year: '2026' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ month: '3', year: '2026' })
  })

  it('finance rejects non-digit month', () => {
    expect(financePromptQuerySchema.safeParse({ month: 'march' }).success).toBe(false)
  })

  it('notes trims and rejects empty strings, accepts an empty query (defaults)', () => {
    expect(notesPromptQuerySchema.safeParse({}).success).toBe(true)
    // optionalString uses .trim().min(1) — a whitespace-only value
    // should fail rather than reach the upstream as a blank.
    expect(notesPromptQuerySchema.safeParse({ folder: '   ' }).success).toBe(false)
  })

  it('recipes accepts limit/offset as digit strings only', () => {
    expect(recipesPromptQuerySchema.safeParse({ limit: '10', offset: '0' }).success).toBe(true)
    expect(recipesPromptQuerySchema.safeParse({ limit: 'all' }).success).toBe(false)
  })
})
