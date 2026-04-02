import { getCookie } from 'h3'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const config = useRuntimeConfig()
  const token = (event.context.accessToken as string | undefined) ?? getCookie(event, 'aic_access') ?? ''

  try {
    const profile = await $fetch<{ id: string; email: string; name: string; avatar_url: string }>(
      `${config.authServiceUrl}/me`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    return {
      user: {
        id: user.id,
        email: profile.email ?? null,
        name: profile.name ?? null,
        picture: profile.avatar_url ?? null
      }
    }
  }
  catch {
    return { user: { id: user.id, email: null, name: null, picture: null } }
  }
})
