import { createError, readMultipartFormData } from 'h3'

// Local Whisper transcription via the `whisper` sidecar container.
// The sidecar exposes a multipart `/transcribe` endpoint and returns
// `{ text, language, language_probability, duration }`. We forward
// only `text` to keep the existing client contract.
//
// Language is autodetected and constrained to the allow-list set on
// the whisper service via `WHISPER_LANGUAGES` (default `uk,en`) — no
// per-request override.

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const parts = await readMultipartFormData(event)
  const audioPart = parts?.find(p => p.name === 'audio')
  if (!audioPart?.data) throw createError({ statusCode: 400, statusMessage: 'No audio' })

  const { whisperUrl } = useRuntimeConfig(event)

  const formData = new FormData()
  formData.append(
    'audio',
    // Wrap in Uint8Array to satisfy the BlobPart type (Node's Buffer
    // is `ArrayBufferLike` which TS won't accept directly here).
    new Blob([new Uint8Array(audioPart.data)], { type: audioPart.type ?? 'audio/webm' }),
    'audio.webm'
  )

  const result = await $fetch<{ text: string }>(`${whisperUrl}/transcribe`, {
    method: 'POST',
    body: formData
  })

  return { text: result.text }
})
