import { z } from 'zod'

// Boundary schemas for the per-user MCP servers a user registers at runtime.
// We store only the connection — url, a display name, and the auth checkbox
// (`useAuth`: send the SSO access token or not). Tools are fetched live, never
// stored. Infer the TS types from these; don't redeclare the shapes.

export const createMcpServerSchema = z.object({
  // Optional — defaults to the URL host on the server if omitted.
  name: z.string().trim().max(120).optional(),
  url: z.string().trim().url(),
  useAuth: z.boolean().default(false)
})

export const updateMcpServerSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    url: z.string().trim().url().optional(),
    useAuth: z.boolean().optional(),
    enabled: z.boolean().optional()
  })
  .strict()

export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>
