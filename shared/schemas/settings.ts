import { z } from 'zod'

// Boundary schema for per-user settings. Infer the types from this; don't
// redeclare them.

// A user-defined starter prompt: a label shown on the chip/picker and the
// message text it inserts.
export const suggestedPromptSchema = z.object({
  label: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(2000)
})

export const updateSettingsSchema = z
  .object({
    // A valid URL or an empty string (to clear it).
    profileUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
    suggestedPrompts: z.array(suggestedPromptSchema).max(20).optional()
  })
  .strict()

export type SuggestedPrompt = z.infer<typeof suggestedPromptSchema>
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
