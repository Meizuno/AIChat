import { describe, expect, it } from 'vitest'
import { collectAttachmentKeys } from '../../../server/utils/attachments'

// collectAttachmentKeys is the disk-cleanup seam used by removeChat: given a
// chat's stored (opaque JSON) message parts, it extracts the /media/{key}
// blob keys so the files can be deleted alongside the rows.
describe('collectAttachmentKeys', () => {
  const key = '9f1c2d3e-4b5a-6c7d-8e9f-0a1b2c3d4e5f.png'

  it('pulls blob keys out of /media file parts', () => {
    const key2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp'
    const messages = [
      { parts: [{ type: 'text', text: 'hi' }, { type: 'file', url: `/media/${key}` }] },
      { parts: [{ type: 'file', url: `/media/${key2}` }] }
    ]
    expect(collectAttachmentKeys(messages)).toEqual([key, key2])
  })

  it('ignores non-media urls, data urls, and malformed parts', () => {
    const messages = [
      { parts: [{ type: 'file', url: 'data:image/png;base64,AAAA' }] },
      { parts: [{ type: 'file', url: 'https://example.com/x.png' }] },
      { parts: [{ type: 'text', text: 'no url' }] },
      { parts: 'not-an-array' },
      { parts: [null, 42, { url: 123 }] }
    ]
    expect(collectAttachmentKeys(messages)).toEqual([])
  })
})
