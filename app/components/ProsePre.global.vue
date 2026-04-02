<script setup lang="ts">
import ProseChart from './content/ProseChart.global.vue'

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: null },
  filename: { type: String, default: null },
  highlights: { type: Array, default: () => [] },
  meta: { type: String, default: null },
  class: { type: String, default: null }
})

const isChartBlock = computed(() => {
  if (props.language === 'chart') return true
  return typeof props.meta === 'string' && /\bchart\b/i.test(props.meta)
})

</script>

<template>
  <ProseChart v-if="isChartBlock" :code="code" />

  <pre v-else :class="$props.class"><slot /></pre>
</template>
