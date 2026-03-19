import { describe, expect, it, vi } from 'vitest'
import { PlaceholderDocumentService } from '@/lib/services/documentService'

describe('PlaceholderDocumentService', () => {
  const service = new PlaceholderDocumentService()

  it('validates file size upper bound', () => {
    const tooLarge = new File([new Uint8Array(1_600_000)], 'big.pdf', { type: 'application/pdf' })

    const result = service.validateFileSize(tooLarge)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('File size exceeds maximum')
  })

  it('validates allowed mime types', () => {
    const unsupported = new File(['x'], 'data.txt', { type: 'text/plain' })

    const result = service.validateFileMimeType(unsupported)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('not supported')
  })

  it('passes full validation for supported file', () => {
    const ok = new File(['x'], 'image.png', { type: 'image/png' })

    const result = service.validateFile(ok)

    expect(result.valid).toBe(true)
  })

  it('returns [] from getDocuments on fetch failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const docs = await service.getDocuments('family-1')

    expect(docs).toEqual([])
    fetchSpy.mockRestore()
  })

  it('throws server-only error for preview url in browser runtime', async () => {
    await expect(service.getPreviewUrl('file.pdf')).rejects.toThrow(
      'Signed URL generation is server-only',
    )
  })
})
