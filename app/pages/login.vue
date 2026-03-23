<script setup lang="ts">
const { loggedIn } = useAuth()
const route = useRoute()
const error = computed(() => route.query.error as string | undefined)

if (loggedIn.value) {
  await navigateTo('/')
}

const signIn = () => { window.location.href = '/api/auth/google' }
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="flex flex-col items-center gap-6 w-full max-w-sm px-4">
      <h1 class="text-2xl font-bold text-highlighted">
        Meizuno AI Chat
      </h1>

      <UAlert
        v-if="error === 'unauthorized'"
        color="error"
        title="Access denied"
        description="Your email is not authorized to use this app."
      />
      <UAlert
        v-else-if="error === 'oauth'"
        color="error"
        title="Authentication error"
        description="Something went wrong. Please try again."
      />

      <UButton
        icon="i-simple-icons-google"
        label="Sign in with Google"
        size="lg"
        block
        @click="signIn"
      />
    </div>
  </div>
</template>
