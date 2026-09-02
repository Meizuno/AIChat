// Port to the code-execution sandbox. The app NEVER runs model/user code
// in-process — it hands the code to a separate, network-isolated sandbox
// component and only ever speaks to it through this interface, so the runtime
// (an HTTP sandbox service today, something else later) can change without
// touching the tool that exposes it (server/services/system-tools.ts).
export interface SandboxRunInput {
  language: string
  source: string
}

export interface SandboxRunResult {
  ok: boolean
  stdout: string
  stderr: string
}

export interface SandboxRunner {
  run(input: SandboxRunInput): Promise<SandboxRunResult>
}

// Default backend: POST the code to the sandbox service and read back its
// result. The contract the sandbox container must implement:
//   POST {baseUrl}/run  { language, source }  ->  { ok, stdout, stderr }
class HttpSandboxRunner implements SandboxRunner {
  constructor(private readonly baseUrl: string) {}

  async run(input: SandboxRunInput): Promise<SandboxRunResult> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000)
      })
      if (!res.ok) return { ok: false, stdout: '', stderr: `sandbox responded ${res.status}` }
      const data = await res.json() as Partial<SandboxRunResult>
      return { ok: data.ok ?? false, stdout: data.stdout ?? '', stderr: data.stderr ?? '' }
    } catch (err) {
      return { ok: false, stdout: '', stderr: `sandbox unreachable: ${(err as Error).message}` }
    }
  }
}

let runner: SandboxRunner | null | undefined

// The process-wide sandbox runner, or null when no sandbox is configured
// (runtimeConfig.sandboxUrl / NUXT_SANDBOX_URL empty) — in which case the
// run_code system tool is simply not offered to the model.
export function getSandboxRunner(): SandboxRunner | null {
  if (runner === undefined) {
    const { sandboxUrl } = useRuntimeConfig()
    runner = sandboxUrl ? new HttpSandboxRunner(sandboxUrl) : null
  }
  return runner
}
