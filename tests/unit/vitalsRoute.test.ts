import { describe, expect, it } from 'vitest'

import { POST } from '@/app/api/vitals/route'

describe('/api/vitals route', () => {
  it('returns success payload for a valid payload', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CLS', value: 0.01, id: 'v1' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
  })

  it('returns 400 error payload when payload is invalid JSON', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBeTruthy()
    expect(typeof payload.error).toBe('string')
  })
})
