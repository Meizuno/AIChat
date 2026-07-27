export default defineAppConfig({
  ui: {
    // Brand palette. `green` is remapped to the Nuxt brand green in
    // app/assets/css/main.css; neutral stays slate.
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    // User messages render with the `soft` variant (assistant uses `naked`),
    // so theming `soft` colors only the user bubble — brand green, no
    // per-instance CSS.
    chatMessage: {
      variants: {
        variant: {
          soft: {
            content: 'bg-primary text-inverted'
          }
        }
      }
    }
  }
})
