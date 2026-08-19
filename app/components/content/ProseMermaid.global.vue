<script setup lang="ts">
// Renders a Mermaid diagram from a ```mermaid fenced block. Client-only (mermaid
// needs the DOM) and theme-aware; mermaid is dynamically imported so it stays
// out of the main bundle until a diagram is actually shown.
//
// While the response streams the block is incomplete, so render() is called
// repeatedly with partial source. Each call uses a UNIQUE id (mermaid creates a
// temp DOM node from it — a shared id makes concurrent renders collide) and only
// the latest result is applied. We also parse first with suppressErrors so a
// partial diagram never renders mermaid's own "Syntax error" graphic.
const props = defineProps({
  code: { type: String, required: true }
})

const PALETTE = [
  '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#0ea5e9',
  '#6366f1', '#ec4899', '#f97316', '#14b8a6', '#84cc16', '#a855f7'
]

const colorMode = useColorMode()
const svg = ref('')
const idBase = useId().replace(/[^a-zA-Z0-9-]/g, '')
let renderSeq = 0

// Give each node its own color (soft fill + solid border), round rectangles, and
// soften polygon corners. Applied to the rendered SVG so it works for every node
// shape without the diagram source having to declare styles.
function colorizeNodes(svgStr: string): string {
  try {
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml')
    doc.querySelectorAll('.node').forEach((node, i) => {
      const color = PALETTE[i % PALETTE.length]!
      const shape = node.querySelector('rect, polygon, circle, ellipse, path')
      if (!shape) return
      // Inline style, not presentation attributes: mermaid embeds a <style>
      // block (e.g. `.node rect { fill: … }`) that would otherwise win.
      const rounded = shape.tagName.toLowerCase() === 'rect' ? 'rx:10px;ry:10px;' : ''
      shape.setAttribute(
        'style',
        `fill:${color}33;stroke:${color};stroke-width:1.5px;stroke-linejoin:round;${rounded}`
      )
    })
    return new XMLSerializer().serializeToString(doc.documentElement)
  } catch {
    return svgStr
  }
}

async function render() {
  const source = props.code.trim()
  if (!source) return
  const seq = ++renderSeq
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      // Diagram source is model-generated — sanitize labels/links.
      securityLevel: 'strict',
      theme: colorMode.value === 'dark' ? 'dark' : 'default'
    })
    // Validate first: an invalid/partial diagram (normal while streaming)
    // returns false WITHOUT rendering mermaid's own "Syntax error" graphic.
    const ok = await mermaid.parse(source, { suppressErrors: true })
    if (!ok || seq !== renderSeq) return
    const { svg: out } = await mermaid.render(`mermaid-${idBase}-${seq}`, source)
    if (seq === renderSeq) svg.value = colorizeNodes(out)
  } catch {
    // Partial/invalid source — keep the last good render; the skeleton shows
    // until the first successful one.
  }
}

onMounted(render)
watch([() => props.code, () => colorMode.value], render)
</script>

<template>
  <ClientOnly>
    <div class="my-5 w-full overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <!-- eslint-disable vue/no-v-html -- mermaid output, securityLevel: strict -->
      <div
        v-if="svg"
        class="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
        v-html="svg"
      />
      <!-- eslint-enable vue/no-v-html -->
      <USkeleton
        v-else
        class="h-40 w-full rounded-xl"
      />
    </div>
  </ClientOnly>
</template>
