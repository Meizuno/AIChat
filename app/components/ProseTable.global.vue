<script setup lang="ts">
import { Comment, Text, cloneVNode, h } from 'vue'
import type { Component, VNode } from 'vue'

// vnode.type is the wide VNodeTypes union; after elementVNodes() filters out
// Text/Comment it is always a component (or intrinsic tag string) h() accepts.
type Renderable = string | Component

// Render a markdown table as a CSS grid of <div>s (not a <table>), so cells are
// easy to customize. thead/tbody render transparently and each row is a subgrid
// row, so columns line up across rows. The grid needs an explicit column count,
// which we read from the first row's cells. Table semantics are kept via ARIA
// roles on the cells (see ProseTr/ProseTh/ProseTd).
//
// Alignment is a fixed positional default — first column left, last column
// right, everything between centered — applied to every cell regardless of the
// alignment the markdown declares. We do that by rewriting each cell's `align`
// prop here, so the cell components stay dumb.
const slots = useSlots()

function elementVNodes(children: unknown): VNode[] {
  return (Array.isArray(children) ? children : []).filter((v): v is VNode =>
    !!v && typeof v === 'object' && 'type' in v
    && (v as VNode).type !== Comment && (v as VNode).type !== Text)
}

// The element children of a section/row vnode (its default slot or static array).
function childVNodes(vnode: VNode): VNode[] {
  const children = vnode.children
  if (Array.isArray(children)) return elementVNodes(children)
  const slot = (children as { default?: () => unknown } | null)?.default
  return typeof slot === 'function' ? elementVNodes(slot()) : []
}

const columnCount = computed(() => {
  // thead first, then tbody — the first non-empty row's cell count wins.
  for (const section of elementVNodes(slots.default?.())) {
    const firstRow = childVNodes(section)[0]
    const cells = firstRow ? childVNodes(firstRow).length : 0
    if (cells > 0) return cells
  }
  return 0
})

// Positional default: first column left, last right, the rest centered.
function columnAlign(index: number, count: number): 'left' | 'center' | 'right' {
  if (count <= 1 || index === 0) return 'left'
  if (index === count - 1) return 'right'
  return 'center'
}

// Rebuild the table subtree, forcing each cell's `align` by its column index so
// the positional default wins over the markdown's own alignment. Rendered in
// place of a plain <slot/> (below) — the original vnodes are never rendered, so
// reusing their children here is safe.
function alignedSections(): VNode[] {
  const count = columnCount.value
  return elementVNodes(slots.default?.()).map(section =>
    h(section.type as Renderable, section.props, {
      default: () => childVNodes(section).map(row =>
        h(row.type as Renderable, row.props, {
          default: () => childVNodes(row).map((cell, i) =>
            cloneVNode(cell, { align: columnAlign(i, count) }))
        }))
    }))
}

// Each column is at least its content width but shares any leftover space
// equally (the `1fr` cap), so the grid fills the table width like the old
// `<table class="w-full">`. That slack is what makes the centered/right cells
// actually sit centered/right instead of hugging their content.
const gridTemplateColumns = computed(() =>
  columnCount.value > 0 ? `repeat(${columnCount.value}, minmax(max-content, 1fr))` : 'minmax(0, 1fr)'
)
</script>

<template>
  <div class="relative my-5 w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
    <div class="relative overflow-x-auto">
      <div
        role="table"
        class="grid text-sm"
        :style="{ gridTemplateColumns }"
      >
        <component :is="alignedSections" />
      </div>
    </div>
  </div>
</template>
