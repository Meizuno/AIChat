import { createError, getQuery, sendRedirect, getCookie, deleteCookie } from 'h3'
import { getPrisma } from '../../../utils/db'
import { signAccessToken, getAccessTokenTTL, getRefreshTokenTTL } from '../../../utils/jwt'
import { setAuthCookies } from '../../../utils/auth'

type GoogleTokenResponse = {
  access_token: string
  expires_in: number
  id_token: string
  refresh_token?: string
  scope: string
  token_type: string
}

type GoogleTokenInfo = {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''

  const savedState = getCookie(event, 'oauth_state')
  deleteCookie(event, 'oauth_state')
  if (!savedState || savedState !== state) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state.' })
  }

  const config = useRuntimeConfig()
  const clientId = config.oauth?.google?.clientId as string | undefined
  const clientSecret = config.oauth?.google?.clientSecret as string | undefined
  const redirectURL = config.oauth?.google?.redirectURL as string | undefined
  const allowedEmailsRaw = config.auth?.allowedEmails as string | undefined

  if (!clientId || !clientSecret || !redirectURL) {
    throw createError({ statusCode: 500, statusMessage: 'Google OAuth is not configured.' })
  }

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Missing OAuth code.' })
  }

  const tokenResponse = await $fetch<GoogleTokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectURL,
      grant_type: 'authorization_code'
    }).toString()
  })

  const tokenInfo = await $fetch<GoogleTokenInfo>('https://oauth2.googleapis.com/tokeninfo', {
    query: { id_token: tokenResponse.id_token }
  })

  const userId = tokenInfo.sub
  const email = tokenInfo.email ?? null
  const name = tokenInfo.name ?? null
  const picture = tokenInfo.picture ?? null

  const allowedEmails = (allowedEmailsRaw ?? '')
    .split(/[,;\s]+/)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)

  if (allowedEmails.length && email && !allowedEmails.includes(email.toLowerCase())) {
    return sendRedirect(event, '/login?error=unauthorized')
  }

  const prisma = getPrisma()
  await prisma.user.upsert({
    where: { id: userId },
    update: { email, name, picture },
    create: { id: userId, email, name, picture }
  })

  const accessTTL = getAccessTokenTTL()
  const refreshTTL = getRefreshTokenTTL()
  const accessToken = await signAccessToken({ id: userId, email, name, picture }, accessTTL)
  const refreshToken = crypto.randomUUID()
  const refreshId = crypto.randomUUID()

  await prisma.refreshToken.create({
    data: {
      id: refreshId,
      user_id: userId,
      token: refreshToken,
      expires_at: new Date(Date.now() + refreshTTL * 1000)
    }
  })

  setAuthCookies(event, accessToken, refreshToken, accessTTL, refreshTTL)
  return sendRedirect(event, '/')
})
