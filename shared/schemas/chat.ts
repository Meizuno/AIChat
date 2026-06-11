import { z } from 'zod'

// Body shape for /api/chat. The messages array comes from the AI
// SDK's `useChat` composable — its element shape (`UIMessage`) is
// large, version-coupled, and validated downstream by
// `convertToModelMessages`. We only enforce the envelope: an array
// of *something* is present. Anything more would duplicate the SDK's
// own schema and rot fast.
export const chatBodySchema = z.object({
  messages: z.array(z.unknown())
})

export type ChatBody = z.infer<typeof chatBodySchema>
