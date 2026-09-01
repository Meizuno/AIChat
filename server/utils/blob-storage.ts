import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Off-database blob storage for chat image attachments. ai-chat keeps chat
// history in Postgres but stores the (potentially large) media bytes on disk,
// behind this small interface so a future S3 backend is a drop-in replacement.
//
// A blob key is `<uuidv4>.<ext>` — an opaque, unguessable token that is
// embedded in the message part URL (`/media/<key>`) on save and served
// publicly by server/routes/media. The extension carries the content type, so
// the store needs no sidecar file or database row.

export interface PutBlobInput {
  data: Buffer
  contentType: string
}

export interface BlobObject {
  data: Buffer
  contentType: string
}

export interface BlobStorage {
  /** Store bytes, return the generated key. */
  put(input: PutBlobInput): Promise<string>
  /** Load a blob by key, or null if it does not exist. */
  get(key: string): Promise<BlobObject | null>
  /** Remove a blob by key. No-op if it is already gone. */
  delete(key: string): Promise<void>
}

// content type ↔ file extension, limited to the image types the uploader
// actually produces (chat image attachments). Unknown → `bin` / octet-stream.
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg'
}
const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml'
}

export function extForContentType(contentType: string): string {
  return CONTENT_TYPE_TO_EXT[contentType.toLowerCase()] ?? 'bin'
}

export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream'
}

// A key must be exactly `<uuidv4>.<ext>`. Validated before it ever touches the
// filesystem, so a hostile `/media/<key>` can never traverse out of the blob
// directory (no slashes, no `..`).
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/

export function isValidBlobKey(key: string): boolean {
  return KEY_RE.test(key)
}

class DiskBlobStorage implements BlobStorage {
  constructor(private readonly baseDir: string) {}

  // <baseDir>/<first 2 chars>/<key> — shard by prefix so no single directory
  // grows unbounded.
  private pathFor(key: string): string {
    return join(this.baseDir, key.slice(0, 2), key)
  }

  async put({ data, contentType }: PutBlobInput): Promise<string> {
    const key = `${randomUUID()}.${extForContentType(contentType)}`
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
    return key
  }

  async get(key: string): Promise<BlobObject | null> {
    if (!isValidBlobKey(key)) return null
    try {
      const data = await readFile(this.pathFor(key))
      return { data, contentType: contentTypeForKey(key) }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    if (!isValidBlobKey(key)) return
    try {
      await unlink(this.pathFor(key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}

/** Construct a disk-backed store rooted at `baseDir` (exported for tests). */
export function createDiskBlobStorage(baseDir: string): BlobStorage {
  return new DiskBlobStorage(baseDir)
}

let storage: BlobStorage | undefined

// Process-wide blob store. The directory comes from runtimeConfig.mediaDir
// (NUXT_MEDIA_DIR); empty → `.data/media` under the cwd for dev. Never read
// process.env here — mirrors getPrisma.
export function getBlobStorage(): BlobStorage {
  if (!storage) {
    const { mediaDir } = useRuntimeConfig()
    storage = new DiskBlobStorage(mediaDir || join(process.cwd(), '.data', 'media'))
  }
  return storage
}
