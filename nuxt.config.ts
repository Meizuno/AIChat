// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    openaiApiKey: '',
    mcpUrl: '',
    authServiceUrl: ''
  },

  mdc: {
    highlight: {
      theme: {
        dark: 'github-dark',
        light: 'github-light'
      },
      langs: ['typescript', 'javascript', 'vue', 'python', 'bash', 'json', 'html', 'css', 'sql']
    }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
