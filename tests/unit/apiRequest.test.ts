import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseBodyWithSchema, parseMultipartFormDataWithLimit } from '@/lib/api/request'

const schema = z.object({ name: z.string().min(1) })

describe('parseBodyWithSchema', () => {
  it('parses and validates JSON input', async () => {
    const result = await parseBodyWithSchema(
      new Request('https://portal.test/api/test', {
        method: 'POST',
        body: JSON.stringify({ name: 'Portal' }),
      }),
      schema,
    )
    expect(result).toEqual({ data: { name: 'Portal' }, error: null, issues: null })
  })

  it('rejects malformed JSON explicitly', async () => {
    const result = await parseBodyWithSchema(
      new Request('https://portal.test/api/test', { method: 'POST', body: '{' }),
      schema,
    )
    expect(result.error).toBe('Invalid JSON request body')
  })

  it('rejects a body whose declared length exceeds the limit before parsing', async () => {
    const result = await parseBodyWithSchema(
      new Request('https://portal.test/api/test', {
        method: 'POST',
        headers: { 'content-length': '1000' },
        body: JSON.stringify({ name: 'Portal' }),
      }),
      schema,
      { maxBytes: 20 },
    )
    expect(result.error).toBe('Request body is too large')
  })

  it('measures the actual body when content-length is absent', async () => {
    const result = await parseBodyWithSchema(
      new Request('https://portal.test/api/test', {
        method: 'POST',
        body: JSON.stringify({ name: 'x'.repeat(100) }),
      }),
      schema,
      { maxBytes: 20 },
    )
    expect(result.error).toBe('Request body is too large')
  })
})

describe('parseMultipartFormDataWithLimit', () => {
  it('parses a multipart request within the actual byte limit', async () => {
    const form = new FormData()
    form.set('label', 'document')
    form.set('file', new File(['%PDF-small'], 'file.pdf', { type: 'application/pdf' }))
    const request = new Request('https://portal.test/upload', { method: 'POST', body: form })

    const result = await parseMultipartFormDataWithLimit(request, 2_048)

    expect(result.error).toBeNull()
    expect(result.data?.get('label')).toBe('document')
  })

  it('stops a chunked multipart body whose real bytes exceed the limit', async () => {
    const boundary = 'bounded-upload-test'
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="large.pdf"',
      'Content-Type: application/pdf',
      '',
      'x'.repeat(2_048),
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const request = new Request('https://portal.test/upload', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: multipartBody,
    })
    request.headers.delete('content-length')

    const result = await parseMultipartFormDataWithLimit(request, 256)

    expect(result).toEqual({ data: null, error: 'Request body is too large', status: 413 })
  })
})
