<template>
  <div class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
    <ol class="relative space-y-2" data-list-type="ordered">
      <slot />
    </ol>
  </div>
</template>
