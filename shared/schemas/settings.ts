import { z } from 'zod'

// Boundary schema for per-user settings. Infer the types from this; don't
// redeclare them.

// A user-defined starter prompt: a label shown on the chip/picker and the
// message text it inserts.
export const suggestedPromptSchema = z.object({
  label: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(2000)
})

// The profile document is fetched server-side from inside the Docker network
// and its body is injected into the system prompt (readable back out of the
// model), so this is an SSRF-with-exfiltration surface. Require https here — the
// runtime host resolution in server/utils/profile.ts is the second line of
// defence. Empty string is still allowed (it clears the setting).
const httpsProfileUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => {
    try {
      return new URL(u).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Profile URL must use https')

export const updateSettingsSchema = z
  .object({
    profileUrl: z.union([httpsProfileUrl, z.literal('')]).optional(),
    suggestedPrompts: z.array(suggestedPromptSchema).max(20).optional()
  })
  .strict()

export type SuggestedPrompt = z.infer<typeof suggestedPromptSchema>
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
