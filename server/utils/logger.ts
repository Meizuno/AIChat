import { createWriteStream, mkdirSync } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { join } from 'node:path'

// A tiny logging port. Call sites only ever touch this interface (getLogger()),
// so the backend can change — console + files today, a log service like the
// VictoriaLogs stack later — without editing a single log call. Lines are
// inline key=value:
//
//   <message> level=<lvl> <k>=<v> ...
//
// e.g. `http level=info request-id=… method=GET path=/api/chat response=200 execution=12ms`
export type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<string, string | number | boolean | undefined>

export interface Logger {
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

// key=value, quoting values that contain whitespace, quotes, or `=` so the line
// stays parseable; undefined fields are dropped.
function formatValue(value: string | number | boolean): string {
  const s = String(value)
  return /[\s"=]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
}

export function formatLogLine(level: LogLevel, message: string, fields?: LogFields): string {
  let line = `${message} level=${level}`
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) line += ` ${key}=${formatValue(value)}`
  }
  return line
}

// Writes each level to the console AND to its own append-only file
// (info.log / warning.log / error.log). The console copy is what Vector ships
// to VictoriaLogs in prod; the files are the on-disk record on the log volume.
class ConsoleFileLogger implements Logger {
  private readonly streams: Record<LogLevel, WriteStream>

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.streams = {
      info: createWriteStream(join(dir, 'info.log'), { flags: 'a' }),
      warn: createWriteStream(join(dir, 'warning.log'), { flags: 'a' }),
      error: createWriteStream(join(dir, 'error.log'), { flags: 'a' })
    }
    // A disk problem (full / permissions) must never crash the server — a log
    // line is not worth taking the process down for.
    for (const stream of Object.values(this.streams)) {
      stream.on('error', err => console.error(`[logger] file write failed: ${(err as Error).message}`))
    }
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    const line = formatLogLine(level, message, fields)
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    consoleFn(line)
    this.streams[level].write(`${line}\n`)
  }

  info(message: string, fields?: LogFields): void { this.write('info', message, fields) }
  warn(message: string, fields?: LogFields): void { this.write('warn', message, fields) }
  error(message: string, fields?: LogFields): void { this.write('error', message, fields) }

  // Flush + close the file streams (graceful shutdown / tests).
  async close(): Promise<void> {
    await Promise.all(Object.values(this.streams).map(
      stream => new Promise<void>(resolve => stream.end(resolve))
    ))
  }
}

/** Construct a console+file logger rooted at `dir` (exported for tests). */
export function createConsoleFileLogger(dir: string): ConsoleFileLogger {
  return new ConsoleFileLogger(dir)
}

let logger: Logger | undefined

// Process-wide logger. The log directory comes from runtimeConfig.logDir
// (NUXT_LOG_DIR); empty → `.data/logs` under the cwd for dev. Never read
// process.env here — mirrors getPrisma / getBlobStorage.
export function getLogger(): Logger {
  if (!logger) {
    const { logDir } = useRuntimeConfig()
    logger = new ConsoleFileLogger(logDir || join(process.cwd(), '.data', 'logs'))
  }
  return logger
}
