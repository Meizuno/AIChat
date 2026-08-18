import { z } from 'zod'

// Boundary schema for per-user settings. `profileUrl` accepts a valid URL or an
// empty string (to clear it). Infer the type from this; don't redeclare it.
export const updateSettingsSchema = z
  .object({
    profileUrl: z.union([z.string().trim().url(), z.literal('')]).optional()
  })
  .strict()

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
