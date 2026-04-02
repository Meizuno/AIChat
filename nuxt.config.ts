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
    databaseUrl: '',
    authServiceUrl: ''
  },

  mdc: {
    highlight: {
      theme: {
        dark: 'github-dark',
        light: 'github-light'
      },
      langs: [
        'typescript', 'javascript', 'vue', 'python', 'bash', 'json', 'html', 'css', 'sql',
        { name: 'chart', scopeName: 'source.chart', patterns: [], fileTypes: [], repository: {} },
        { name: 'list', scopeName: 'source.list', patterns: [], fileTypes: [], repository: {} }
      ]
    }
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Meizuno AI' },
        { name: 'theme-color', content: '#6366f1' }
      ]
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
