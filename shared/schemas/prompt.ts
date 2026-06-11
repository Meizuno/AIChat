import { z } from 'zod'

// Query schemas for the /api/prompts/* endpoints. The values are
// passed through to the upstream MCP service untouched — these
// schemas exist to enforce types and trim obviously bad input at our
// edge, not to constrain what each service accepts.
//
// Every field is optional: the upstream service applies its own
// defaults when omitted, and stricter validation belongs there
// rather than here.

const optionalString = z.string().trim().min(1).optional()
const optionalIntString = z.string().regex(/^\d+$/, 'expected an integer').optional()

export const financePromptQuerySchema = z.object({
  month: optionalIntString,
  year: optionalIntString
})

export const notesPromptQuerySchema = z.object({
  id: optionalString,
  folder: optionalString,
  search: optionalString,
  limit: optionalIntString,
  offset: optionalIntString,
  view: optionalString
})

export const recipesPromptQuerySchema = z.object({
  id: optionalString,
  tag: optionalString,
  search: optionalString,
  limit: optionalIntString,
  offset: optionalIntString
})

export type FinancePromptQuery = z.infer<typeof financePromptQuerySchema>
export type NotesPromptQuery = z.infer<typeof notesPromptQuerySchema>
export type RecipesPromptQuery = z.infer<typeof recipesPromptQuerySchema>
