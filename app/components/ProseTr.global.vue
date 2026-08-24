<template>
  <!-- A subgrid row spanning every column, so its cells align with the table's
       columns while the row stays a real box (borders, hover). -->
  <div
    role="row"
    class="col-span-full grid grid-cols-subgrid items-center border-b border-slate-200/70 transition-colors last:border-b-0 hover:bg-slate-50/80 dark:border-slate-700/60 dark:hover:bg-slate-800/40"
  >
    <slot />
  </div>
</template>
