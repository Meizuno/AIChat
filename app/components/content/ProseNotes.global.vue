<script setup lang="ts">
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from 'd3-force'

// Knowledge-base overview card. Single view: a force-directed graph
// matching the knowledge-base home page. A folder-chip row on top
// scopes the graph to one top-level folder's subtree (or "All" for
// the full vault). Clicking a note node loads its markdown inline
// below the graph.
//
// Payload shapes the LLM may send:
//   { view: 'graph',   nodes, edges }                 — used directly
//   { view: 'folders', folders }                      — bucket-shaped
//   { folders, notes, total, ... }                    — legacy list shape
// For the latter two we lazily fetch `?view=graph` so the same
// component always renders a graph regardless of how the response
// was originally framed.

type NoteItem = {
  id: number
  title: string
  folder: string | null
  snippet: string | null
  hasContent: boolean
  updated_at: string
}
type FolderBucket = { label: string, count: number, notes: NoteItem[] }
type GraphNode = SimulationNodeDatum & {
  id: number | string
  title: string
  type: 'note' | 'folder'
  folder: string | null
  links: number
}
type GraphEdge = SimulationLinkDatum<GraphNode> & {
  source: number | string | GraphNode
  target: number | string | GraphNode
}

type ListPayload = { folders: Array<{ label: string, count: number }>, notes: NoteItem[], total: number }
type FoldersPayload = { view: 'folders', folders: FolderBucket[], total: number }
type GraphPayload = { view: 'graph', nodes: GraphNode[], edges: GraphEdge[] }
type AnyPayload = ListPayload | FoldersPayload | GraphPayload

const props = defineProps({
  code: { type: String, required: true }
})

const parsed = computed(() => {
  try {
    return JSON.parse(props.code.trim()) as AnyPayload
  } catch {
    return null
  }
})

// ───────────────────────────── data ──────────────────────────────

const graphData = ref<GraphPayload | null>(null)
const loading = ref(false)

async function ensureGraph() {
  if (graphData.value) return
  if (parsed.value && 'view' in parsed.value && parsed.value.view === 'graph') {
    graphData.value = parsed.value
    return
  }
  loading.value = true
  try {
    graphData.value = await $fetch<GraphPayload>('/api/prompts/notes', {
      params: { view: 'graph' }
    })
  } catch (err) {
    console.warn('[notes] graph fetch failed:', err)
  } finally {
    loading.value = false
  }
}
onMounted(ensureGraph)

// ───────────────────────────── folder filter ─────────────────────

const selectedFolder = ref<string | null>(null)

// Top-level folder buckets derived from the graph's note nodes.
const folderOptions = computed(() => {
  if (!graphData.value) return []
  const counts = new Map<string, number>()
  for (const n of graphData.value.nodes) {
    if (n.type !== 'note') continue
    const top = (n.folder ?? '').split('/')[0] ?? ''
    counts.set(top, (counts.get(top) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})

const folderLabel = (label: string) => label === '' ? 'Root' : label

// Filter the full graph to a folder subtree. Keeps the folder
// pseudo-node, every descendant folder pseudo-node, and every note
// whose folder lives inside the subtree.
function filterGraphTo(g: GraphPayload, folderPath: string | null): {
  nodes: GraphNode[]
  edges: GraphEdge[]
} {
  if (folderPath === null) return { nodes: g.nodes, edges: g.edges }
  const inSubtree = (path: string | null) =>
    path === folderPath || !!path?.startsWith(folderPath + '/')
  const kept = g.nodes.filter((n) => {
    if (n.type === 'note') return inSubtree(n.folder)
    const p = String(n.id).slice('folder:'.length)
    return inSubtree(p)
  })
  const ids = new Set(kept.map(n => n.id))
  const keptEdges = g.edges.filter((e) => {
    const s = typeof e.source === 'object' ? (e.source as GraphNode).id : e.source
    const t = typeof e.target === 'object' ? (e.target as GraphNode).id : e.target
    return ids.has(s) && ids.has(t)
  })
  return { nodes: kept, edges: keptEdges }
}

// ───────────────────────────── d3 graph ──────────────────────────

const containerRef = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const transform = reactive({ x: 0, y: 0, k: 1 })
const nodes = shallowRef<GraphNode[]>([])
const edges = shallowRef<GraphEdge[]>([])
const hoveredId = ref<number | string | null>(null)

const neighbours = computed<Set<number | string> | null>(() => {
  if (hoveredId.value == null) return null
  const set = new Set<number | string>([hoveredId.value])
  for (const e of edges.value) {
    const s = typeof e.source === 'object' ? (e.source as GraphNode).id : e.source
    const t = typeof e.target === 'object' ? (e.target as GraphNode).id : e.target
    if (s === hoveredId.value) set.add(t)
    if (t === hoveredId.value) set.add(s)
  }
  return set
})
const isFaded = (id: number | string) =>
  neighbours.value !== null && !neighbours.value.has(id)
const isEdgeFaded = (e: GraphEdge) => {
  if (neighbours.value === null) return false
  const s = typeof e.source === 'object' ? (e.source as GraphNode).id : e.source
  const t = typeof e.target === 'object' ? (e.target as GraphNode).id : e.target
  return !(neighbours.value.has(s) && neighbours.value.has(t))
}

function radius(n: GraphNode) {
  if (n.type === 'folder') return 6 + Math.sqrt(n.links) * 2
  return 4 + Math.sqrt(n.links) * 1.2
}

const PALETTE = [
  '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e',
  '#0ea5e9', '#84cc16', '#ec4899', '#6366f1', '#14b8a6'
]
const ROOT_NODE = '#64748b'

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function topFolder(n: GraphNode): string {
  if (n.type === 'note') return (n.folder ?? '').split('/')[0] ?? ''
  const idStr = String(n.id)
  return idStr.startsWith('folder:')
    ? idStr.slice('folder:'.length).split('/')[0] ?? ''
    : ''
}
function nodeFill(n: GraphNode) {
  const top = topFolder(n)
  if (!top) return ROOT_NODE
  return PALETTE[hashStr(top) % PALETTE.length]!
}

let simulation: Simulation<GraphNode, GraphEdge> | null = null
const userInteracted = ref(false)
const FIT_PADDING = 30

function fitToViewport() {
  if (!nodes.value.length || width.value === 0 || height.value === 0) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const n of nodes.value) {
    if (n.x == null || n.y == null) continue
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  if (!isFinite(minX) || !isFinite(minY)) return
  const bboxW = Math.max(1, maxX - minX)
  const bboxH = Math.max(1, maxY - minY)
  const k = Math.min(
    (width.value - 2 * FIT_PADDING) / bboxW,
    (height.value - 2 * FIT_PADDING) / bboxH,
    1.5
  )
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  transform.k = k
  transform.x = width.value / 2 - cx * k
  transform.y = height.value / 2 - cy * k
}

function startSim() {
  if (simulation) simulation.stop()
  if (!nodes.value.length) return
  simulation = forceSimulation<GraphNode>(nodes.value)
    .force('link', forceLink<GraphNode, GraphEdge>(edges.value)
      .id(d => d.id)
      .distance((e) => {
        const s = typeof e.source === 'object' ? e.source.type : null
        const t = typeof e.target === 'object' ? e.target.type : null
        return s === 'folder' && t === 'folder' ? 90 : 50
      })
      .strength((e) => {
        const s = typeof e.source === 'object' ? e.source.type : null
        const t = typeof e.target === 'object' ? e.target.type : null
        return s === 'folder' && t === 'folder' ? 0.3 : 0.6
      })
    )
    .force('charge', forceManyBody<GraphNode>().strength(d => d.type === 'folder' ? -400 : -200))
    .force('x', forceX(width.value / 2).strength(0.08))
    .force('y', forceY(height.value / 2).strength(0.08))
    .force('collide', forceCollide<GraphNode>().radius(d => radius(d) + 10))
    .alphaDecay(0.06)
  simulation.stop()
  simulation.tick(60)
  simulation
    .alpha(0.3)
    .on('tick', () => {
      triggerRef(nodes)
      triggerRef(edges)
      if (!userInteracted.value) fitToViewport()
    })
    .restart()
}

function measure() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  width.value = rect.width
  height.value = rect.height
  if (simulation) {
    simulation
      .force('x', forceX(width.value / 2).strength(0.08))
      .force('y', forceY(height.value / 2).strength(0.08))
      .alpha(0.3).restart()
  }
}

// Re-seed when the graph data or the folder filter changes. Reset
// `userInteracted` so a fresh filter re-fits the viewport instead
// of staying at the prior pan/zoom.
watch([graphData, selectedFolder], async ([g]) => {
  if (!g) return
  const filtered = filterGraphTo(g, selectedFolder.value)
  nodes.value = filtered.nodes
  edges.value = filtered.edges
  userInteracted.value = false
  await nextTick()
  measure()
  if (nodes.value.length) startSim()
})

// Pan / zoom.
function onWheel(e: WheelEvent) {
  e.preventDefault()
  userInteracted.value = true
  const factor = Math.exp(-e.deltaY * 0.001)
  const newK = Math.min(8, Math.max(0.2, transform.k * factor))
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  transform.x = mx - (mx - transform.x) * (newK / transform.k)
  transform.y = my - (my - transform.y) * (newK / transform.k)
  transform.k = newK
}
let panning = false
let panStart = { x: 0, y: 0, tx: 0, ty: 0 }
function onPanStart(e: PointerEvent) {
  if ((e.target as Element).closest('[data-node]')) return
  userInteracted.value = true
  panning = true
  panStart = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}
function onPanMove(e: PointerEvent) {
  if (!panning) return
  transform.x = panStart.tx + (e.clientX - panStart.x)
  transform.y = panStart.ty + (e.clientY - panStart.y)
}
function onPanEnd(e: PointerEvent) {
  panning = false
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
}

// Node drag: a click (no movement) on a note loads + opens it
// below; drag repositions; folder nodes only drag.
const dragState = ref<{ id: number | string, moved: boolean } | null>(null)
function toGraphCoords(e: PointerEvent) {
  const rect = containerRef.value!.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left - transform.x) / transform.k,
    y: (e.clientY - rect.top - transform.y) / transform.k
  }
}
function onNodePointerDown(node: GraphNode, e: PointerEvent) {
  e.stopPropagation()
  userInteracted.value = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  if (simulation) simulation.alphaTarget(0.3).restart()
  const { x, y } = toGraphCoords(e)
  node.fx = x
  node.fy = y
  dragState.value = { id: node.id, moved: false }
}
function onNodePointerMove(node: GraphNode, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return
  dragState.value.moved = true
  const { x, y } = toGraphCoords(e)
  node.fx = x
  node.fy = y
}
const openedNoteId = ref<number | null>(null)
const openedNoteContent = ref<string | null>(null)
const openedNoteLoading = ref(false)
async function onNodePointerUp(node: GraphNode, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  if (simulation) simulation.alphaTarget(0)
  node.fx = null
  node.fy = null
  const moved = dragState.value.moved
  dragState.value = null
  if (moved || node.type !== 'note') return
  openedNoteId.value = node.id as number
  openedNoteContent.value = null
  openedNoteLoading.value = true
  try {
    const data = await $fetch<{ note: { content: string } }>('/api/prompts/notes', {
      params: { id: node.id }
    })
    openedNoteContent.value = data.note?.content ?? ''
  } catch { /* ignore */ } finally { openedNoteLoading.value = false }
}

onMounted(() => {
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  simulation?.stop()
})
</script>

<template>
  <div class="relative my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800">
    <div class="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-indigo-400/10 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-violet-400/10 blur-2xl" />

    <!-- Header -->
    <div class="mb-4 flex items-center justify-between gap-3">
      <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Knowledge base
      </p>
      <p
        v-if="graphData"
        class="text-xs text-slate-500 dark:text-slate-400"
      >
        {{ graphData.nodes.filter(n => n.type === 'note').length }} note{{ graphData.nodes.filter(n => n.type === 'note').length === 1 ? '' : 's' }}
      </p>
    </div>

    <!-- Folder chips — scope the graph to a single top-level folder. -->
    <div
      v-if="folderOptions.length"
      class="mb-4 flex flex-wrap gap-1.5"
    >
      <button
        class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
        :class="selectedFolder === null
          ? 'bg-indigo-500 text-white'
          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'"
        @click="selectedFolder = null"
      >
        <UIcon
          name="i-lucide-layers"
          class="h-3 w-3"
        />
        All
      </button>
      <button
        v-for="opt in folderOptions"
        :key="opt.label || '__root__'"
        class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
        :class="selectedFolder === opt.label
          ? 'bg-indigo-500 text-white'
          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'"
        @click="selectedFolder = opt.label"
      >
        <UIcon
          :name="opt.label === '' ? 'i-lucide-home' : 'i-lucide-folder'"
          class="h-3 w-3"
        />
        {{ folderLabel(opt.label) }}
        <span class="opacity-70">{{ opt.count }}</span>
      </button>
    </div>

    <!-- Loading shim -->
    <p
      v-if="loading"
      class="text-xs text-slate-400 text-center py-12"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="inline h-3.5 w-3.5 animate-spin mr-1"
      />
      Loading…
    </p>

    <!-- Graph -->
    <template v-else-if="graphData">
      <p
        v-if="!nodes.length"
        class="text-sm text-slate-400 text-center py-6"
      >
        No notes{{ selectedFolder !== null ? ' in this folder' : ' yet' }}.
      </p>
      <template v-else>
        <div
          ref="containerRef"
          class="relative h-80 rounded-xl border border-slate-200/70 bg-slate-50/50 overflow-hidden touch-none select-none dark:border-slate-700/60 dark:bg-slate-900/30"
          @wheel="onWheel"
          @pointerdown="onPanStart"
          @pointermove="onPanMove"
          @pointerup="onPanEnd"
          @pointercancel="onPanEnd"
        >
          <svg
            :width="width"
            :height="height"
            class="block cursor-grab active:cursor-grabbing"
          >
            <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
              <line
                v-for="(e, i) in edges"
                :key="`e${i}`"
                :x1="(e.source as GraphNode).x ?? 0"
                :y1="(e.source as GraphNode).y ?? 0"
                :x2="(e.target as GraphNode).x ?? 0"
                :y2="(e.target as GraphNode).y ?? 0"
                stroke="currentColor"
                :stroke-opacity="isEdgeFaded(e) ? 0.1 : 0.35"
                stroke-width="1"
                class="text-slate-400 dark:text-slate-500 pointer-events-none"
              />
              <g
                v-for="n in nodes"
                :key="n.id"
                data-node
                :opacity="isFaded(n.id) ? 0.2 : 1"
                style="transition: opacity 200ms ease-out;"
                @pointerenter="hoveredId = n.id"
                @pointerleave="hoveredId = null"
                @pointerdown="onNodePointerDown(n, $event)"
                @pointermove="onNodePointerMove(n, $event)"
                @pointerup="onNodePointerUp(n, $event)"
                @pointercancel="onNodePointerUp(n, $event)"
              >
                <circle
                  :cx="n.x ?? 0"
                  :cy="n.y ?? 0"
                  :r="radius(n)"
                  :fill="nodeFill(n)"
                  :fill-opacity="n.type === 'folder' ? 0.25 : 1"
                  :stroke="n.type === 'folder' ? nodeFill(n) : 'transparent'"
                  :stroke-width="n.type === 'folder' ? 2 : 0"
                  :class="n.type === 'note' ? 'cursor-pointer' : 'cursor-grab'"
                />
                <text
                  :x="n.x ?? 0"
                  :y="(n.y ?? 0) + radius(n) + 10"
                  text-anchor="middle"
                  :font-weight="n.type === 'folder' ? 600 : 400"
                  :style="{ fontSize: `${Math.max(9, 11 / transform.k)}px` }"
                  class="fill-slate-700 dark:fill-slate-200 pointer-events-none"
                  style="paint-order: stroke; stroke: var(--ui-bg, white); stroke-width: 2; stroke-linejoin: round;"
                >{{ n.title }}</text>
              </g>
            </g>
          </svg>
        </div>

        <p class="mt-2 text-xs text-slate-400 text-center">
          Drag a node to reposition · scroll to zoom · click a note to open it
        </p>

        <!-- Inline note panel for whichever note was clicked. -->
        <div
          v-if="openedNoteId != null"
          class="mt-3 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/50"
        >
          <div
            v-if="openedNoteLoading"
            class="flex items-center gap-2 text-xs text-slate-400"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="h-3.5 w-3.5 animate-spin"
            />
            Loading note…
          </div>
          <div
            v-else-if="openedNoteContent"
            class="prose prose-sm dark:prose-invert max-w-none *:first:mt-0 *:last:mb-0"
          >
            <MDC
              :value="openedNoteContent"
              :cache-key="`graph-note-${openedNoteId}`"
            />
          </div>
          <p
            v-else
            class="text-xs text-slate-400 italic"
          >
            No content
          </p>
        </div>
      </template>
    </template>
  </div>
</template>
