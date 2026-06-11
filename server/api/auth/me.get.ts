import type { ViewerProfile } from '#shared/types/auth'

// Decorate the session user with the profile fields the client uses
// for the avatar/name. The auth service is the source of truth; we
// fall back to a bare `{ id }` if it's transiently unreachable so the
// UI can still render rather than logging the user out.
export default defineEventHandler(async (event): Promise<{ user: ViewerProfile }> => {
  const user = await requireAuthUser(event)
  const config = useRuntimeConfig()
  const token = event.context.accessToken ?? ''

  try {
    const profile = await $fetch<{ id: string, email: string, name: string, avatar_url: string }>(
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
  } catch {
    return { user: { id: user.id, email: null, name: null, picture: null } }
  }
})
