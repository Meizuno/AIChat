import { getCookie, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'aic_refresh')
  if (!refreshToken) throw createError({ statusCode: 401, statusMessage: 'No refresh token' })

  const config = useRuntimeConfig()

  const result = await $fetch<{ access_token: string, refresh_token: string }>(
    `${config.authServiceUrl}/refresh`,
    { method: 'POST', body: { refresh_token: refreshToken } }
  )

  setAuthCookies(event, result.access_token, result.refresh_token)

  const user = await verifyAccessToken(result.access_token)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Invalid refreshed token' })

  event.context.user = user
  event.context.accessToken = result.access_token

  return { ok: true }
})
