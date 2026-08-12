import { describe, expect, it } from 'vitest'
import {
  detectDocumentMimeType,
  documentContentDisposition,
  isValidDocumentScopeId,
  requestContentLengthExceeds,
  sanitizeDocumentFileName,
  validateDocumentUpload,
  validateImageBytes,
  validateImageUpload,
} from '@/lib/documentSecurity'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('document security helpers', () => {
  it('removes path components and control characters from file names', () => {
    expect(sanitizeDocumentFileName('../private/passport\r\n.pdf')).toBe('passport.pdf')
  })

  it('recognizes supported file signatures', () => {
    expect(detectDocumentMimeType(PDF_BYTES)).toBe('application/pdf')
    expect(
      detectDocumentMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png')
  })

  it('rejects a declared MIME type that disagrees with file bytes', () => {
    const file = new File([PDF_BYTES], 'passport.jpg', { type: 'image/jpeg' })

    const result = validateDocumentUpload(file, PDF_BYTES)

    expect(result).toEqual(
      expect.objectContaining({ valid: false, status: 415, error: expect.stringMatching(/match/) }),
    )
  })

  it('requires the extension to agree with detected content', () => {
    const file = new File([PDF_BYTES], 'passport.jpg', { type: 'application/pdf' })

    const result = validateDocumentUpload(file, PDF_BYTES)

    expect(result).toEqual(
      expect.objectContaining({
        valid: false,
        status: 415,
        error: expect.stringMatching(/extension/),
      }),
    )
  })

  it('validates image signatures instead of trusting a declared image type', () => {
    expect(
      validateImageBytes(new TextEncoder().encode('<svg></svg>'), 'image/svg+xml', {
        maxBytes: 1024,
        maxSizeLabel: '1 KB',
      }),
    ).toEqual(expect.objectContaining({ valid: false, status: 415 }))

    expect(
      validateImageBytes(PNG_BYTES, 'image/png', {
        maxBytes: 1024,
        maxSizeLabel: '1 KB',
      }),
    ).toEqual(
      expect.objectContaining({
        valid: true,
        value: expect.objectContaining({ fileType: 'image/png' }),
      }),
    )
  })

  it('requires image extensions to match their detected content', () => {
    const file = new File([PNG_BYTES], 'notice.jpg', { type: 'image/png' })

    expect(validateImageUpload(file, PNG_BYTES, { maxBytes: 1024, maxSizeLabel: '1 KB' })).toEqual(
      expect.objectContaining({ valid: false, status: 415 }),
    )
  })

  it('can reject oversized requests before parsing multipart bodies', () => {
    const request = new Request('http://localhost/upload', {
      headers: { 'content-length': '2049' },
    })

    expect(requestContentLengthExceeds(request, 2048)).toBe(true)
    expect(requestContentLengthExceeds(request, 4096)).toBe(false)
  })

  it('builds a safe RFC 5987 content disposition', () => {
    const value = documentContentDisposition('résumé\r\n.pdf', 'attachment')

    expect(value).toContain('attachment;')
    expect(value).not.toContain('\r')
    expect(value).not.toContain('\n')
    expect(value).toContain("filename*=UTF-8''")
  })

  it('accepts bounded scope identifiers and rejects path traversal', () => {
    expect(isValidDocumentScopeId('PPD-2026_001')).toBe(true)
    expect(isValidDocumentScopeId('../scope')).toBe(false)
    expect(isValidDocumentScopeId('scope/child')).toBe(false)
  })
})
