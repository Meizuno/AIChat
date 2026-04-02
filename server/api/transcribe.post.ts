import { createError, readMultipartFormData } from 'h3'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const parts = await readMultipartFormData(event)
  const audioPart = parts?.find(p => p.name === 'audio')
  if (!audioPart?.data) throw createError({ statusCode: 400, statusMessage: 'No audio' })

  const { openaiApiKey } = useRuntimeConfig(event)

  const formData = new FormData()
  formData.append('file', new Blob([audioPart.data], { type: audioPart.type ?? 'audio/webm' }), 'audio.webm')
  formData.append('model', 'whisper-1')
  formData.append('prompt', 'Transcribe exactly as spoken. Use only English (en) or Ukrainian (uk). Do not translate.')

  const result = await $fetch<{ text: string }>('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${openaiApiKey}` },
    body: formData
  })

  return { text: result.text }
})
