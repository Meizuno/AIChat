type Pricing = { inputPerMillion: number, outputPerMillion: number }
type UsageDelta = { inputTokens?: number, outputTokens?: number, totalTokens?: number }
type Usage = { inputTokens: number, outputTokens: number, totalTokens: number }

// Token-usage accumulator + cost readout. The AI SDK emits a
// `data-usage` chunk at the end of each completion; the chat
// component forwards it here via `accumulate`. Costs are computed
// off the running totals using whatever the /api/config pricing
// block reports, with sensible fallbacks when none is configured.
//
// Pricing is read via a getter (not a plain value) so the composable
// stays reactive to the appConfig that arrives via useFetch.
export function useUsage(pricing: () => Pricing | undefined) {
  const usage = ref<Usage | null>(null)

  function accumulate(delta: UsageDelta) {
    const prev = usage.value
    usage.value = {
      inputTokens: (prev?.inputTokens ?? 0) + (delta.inputTokens ?? 0),
      outputTokens: (prev?.outputTokens ?? 0) + (delta.outputTokens ?? 0),
      totalTokens: (prev?.totalTokens ?? 0) + (delta.totalTokens ?? 0)
    }
  }

  const estimatedCost = computed(() => {
    if (!usage.value) return null
    const p = pricing()
    // Defaults track gpt-4o-mini's price band — applied only when the
    // server config omits a pricing block.
    const inputPrice = p?.inputPerMillion ?? 0.20
    const outputPrice = p?.outputPerMillion ?? 1.25
    const cost = (usage.value.inputTokens / 1_000_000) * inputPrice
      + (usage.value.outputTokens / 1_000_000) * outputPrice
    return cost < 0.01 ? '< $0.01' : `$${cost.toFixed(4)}`
  })

  return { usage, accumulate, estimatedCost }
}
