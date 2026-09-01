import { z } from 'zod'

// Body shape for /api/chat. The messages array comes from the AI
// SDK's `useChat` composable — its element shape (`UIMessage`) is
// large, version-coupled, and validated downstream by
// `convertToModelMessages`. We only enforce the envelope: an array
// of *something* is present. Anything more would duplicate the SDK's
// own schema and rot fast.
export const chatBodySchema = z.object({
  // Chat id chosen by the client (the AI SDK Chat instance). Optional so the
  // endpoint still works without persistence; when present, the turn is saved.
  id: z.string().uuid().optional(),
  // AI SDK send trigger. Only on 'submit-message' does the client send just the
  // newest message and the server rebuild prior history from the DB. On
  // 'regenerate-message' — or when absent (a raw client sending the full array)
  // — the messages array is trusted as the transcript, as-is.
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().optional(),
  messages: z.array(z.unknown())
})

export type ChatBody = z.infer<typeof chatBodySchema>
