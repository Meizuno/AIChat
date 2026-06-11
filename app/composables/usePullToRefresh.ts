import type { Ref } from 'vue'

type Options = {
  threshold?: number
  max?: number
  // Returns false to skip the gesture entirely (e.g. while a stream
  // is in flight or another modal is open).
  canPull?: () => boolean
  // What to do when the user releases past the threshold. Defaults
  // to a full page reload — chat-history-clear semantics for the
  // mobile path.
  onTrigger?: () => void
}

// Mobile pull-to-refresh on the chat scroll container. The handlers
// only fire when scrollTop is 0 (so a normal scroll-up gesture
// inside the message list is unaffected), and we skip touches that
// originate on the sticky input footer. The reactive `distance` /
// `ready` are surfaced for the visual indicator the page renders
// above the chat.
export function usePullToRefresh(
  container: Ref<HTMLElement | null>,
  options: Options = {}
) {
  const THRESHOLD = options.threshold ?? 70
  const MAX = options.max ?? 120
  const distance = ref(0)
  const pulling = ref(false)
  const ready = computed(() => distance.value >= THRESHOLD)
  let startY: number | null = null

  function onStart(e: TouchEvent) {
    if (!container.value || container.value.scrollTop > 0) return
    if (options.canPull && !options.canPull()) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-chat-footer]')) return
    startY = e.touches[0]?.clientY ?? null
    pulling.value = startY !== null
  }

  function onMove(e: TouchEvent) {
    if (startY === null) return
    const delta = (e.touches[0]?.clientY ?? startY) - startY
    if (delta <= 0) {
      distance.value = 0
      return
    }
    distance.value = Math.min(delta * 0.5, MAX)
    if (distance.value > 0) e.preventDefault()
  }

  function onEnd() {
    if (ready.value) {
      (options.onTrigger ?? (() => window.location.reload()))()
      return
    }
    distance.value = 0
    startY = null
    pulling.value = false
  }

  onMounted(() => {
    const el = container.value
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
  })

  onBeforeUnmount(() => {
    const el = container.value
    if (!el) return
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  })

  return { distance, pulling, ready }
}
