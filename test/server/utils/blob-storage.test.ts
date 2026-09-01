import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  contentTypeForKey,
  createDiskBlobStorage,
  extForContentType,
  isValidBlobKey,
  type BlobStorage
} from '../../../server/utils/blob-storage'

describe('blob key helpers', () => {
  it('maps content types to extensions and back', () => {
    expect(extForContentType('image/png')).toBe('png')
    expect(extForContentType('image/jpeg')).toBe('jpg')
    expect(extForContentType('IMAGE/WEBP')).toBe('webp')
    expect(extForContentType('application/x-evil')).toBe('bin')

    expect(contentTypeForKey('abc.png')).toBe('image/png')
    expect(contentTypeForKey('abc.JPG')).toBe('image/jpeg')
    expect(contentTypeForKey('abc.bin')).toBe('application/octet-stream')
  })

  it('accepts only <uuid>.<ext> keys (rejects traversal)', () => {
    expect(isValidBlobKey('9f1c2d3e-4b5a-6c7d-8e9f-0a1b2c3d4e5f.png')).toBe(true)
    expect(isValidBlobKey('../../etc/passwd')).toBe(false)
    expect(isValidBlobKey('9f1c2d3e-4b5a-6c7d-8e9f-0a1b2c3d4e5f')).toBe(false) // no ext
    expect(isValidBlobKey('a/b.png')).toBe(false)
    expect(isValidBlobKey('not-a-uuid.png')).toBe(false)
  })
})

describe('DiskBlobStorage', () => {
  let dir: string
  let storage: BlobStorage

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'blobtest-'))
    storage = createDiskBlobStorage(dir)
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips put → get with the right content type', async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const key = await storage.put({ data, contentType: 'image/png' })
    expect(isValidBlobKey(key)).toBe(true)
    expect(key.endsWith('.png')).toBe(true)

    const object = await storage.get(key)
    expect(object).not.toBeNull()
    expect(object!.contentType).toBe('image/png')
    expect(object!.data.equals(data)).toBe(true)
  })

  it('shards files by the first two characters of the key', async () => {
    const key = await storage.put({ data: Buffer.from('x'), contentType: 'image/gif' })
    // Written under <dir>/<2-char shard>/<key>, not flat.
    const onDisk = await readFile(join(dir, key.slice(0, 2), key))
    expect(onDisk.toString()).toBe('x')
  })

  it('returns null for a missing or invalid key', async () => {
    expect(await storage.get('9f1c2d3e-4b5a-6c7d-8e9f-0a1b2c3d4e5f.png')).toBeNull()
    expect(await storage.get('../../etc/passwd')).toBeNull()
  })

  it('deletes a blob and is a no-op when already gone', async () => {
    const key = await storage.put({ data: Buffer.from('bye'), contentType: 'image/webp' })
    await storage.delete(key)
    expect(await storage.get(key)).toBeNull()
    await expect(storage.delete(key)).resolves.toBeUndefined() // second delete: no throw
    await expect(storage.delete('../../etc/passwd')).resolves.toBeUndefined()
  })
})
