// The decorated user profile the client renders — avatar, name, email
// alongside the id. `id` is the server-side session identity (set on
// event.context.user as `AuthUser`); the other fields are fetched
// from the external auth service by /api/auth/me. The name is
// intentionally distinct from the server-only `AuthUser` so the two
// types don't collide via Nuxt auto-imports.
export type ViewerProfile = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}
