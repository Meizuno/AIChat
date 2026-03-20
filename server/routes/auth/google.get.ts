export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    const config = useRuntimeConfig(event)
    const allowedEmails = (config.allowedEmails as string)
      .split(',')
      .map((e: string) => e.trim())
      .filter(Boolean)

    if (allowedEmails.length && !allowedEmails.includes(user.email)) {
      return sendRedirect(event, '/login?error=unauthorized')
    }

    await setUserSession(event, {
      user: {
        email: user.email,
        name: user.name,
        avatar: user.picture
      }
    })

    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth')
  }
})
