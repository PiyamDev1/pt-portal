import { describe, expect, it } from 'vitest'
import { parseDataUrl } from '@/lib/issueReportUtils'

describe('issue report data URLs', () => {
  it('decodes canonical base64 image payloads', () => {
    const parsed = parseDataUrl('data:image/png;base64,iVBORw0KGgo=')

    expect(parsed.contentType).toBe('image/png')
    expect(parsed.buffer).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('rejects malformed and non-base64 data URLs', () => {
    expect(() => parseDataUrl('data:image/png,plain-text')).toThrow(/Invalid data URL/)
    expect(() => parseDataUrl('data:image/png;base64,not!base64')).toThrow(/Invalid data URL/)
  })
})
