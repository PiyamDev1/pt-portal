import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrappeApiError, frappeRequest } from '@/lib/integrations/frappe/client'

describe('frappeRequest', () => {
  beforeEach(() => {
    vi.stubEnv('FRAPPE_BASE_URL', 'https://frappe.example.test')
    vi.stubEnv('FRAPPE_API_KEY', 'api-key')
    vi.stubEnv('FRAPPE_API_SECRET', 'api-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('preserves structured Frappe errors and extracts server messages', async () => {
    const serverMessages = JSON.stringify([
      JSON.stringify({
        message: 'DocType Employee not found',
        title: 'Message',
      }),
    ])

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              exc_type: 'DoesNotExistError',
              _server_messages: serverMessages,
            }),
            {
              status: 404,
              statusText: 'Not Found',
            },
          ),
        ),
      ),
    )

    await expect(frappeRequest('/api/resource/Employee', { retries: 0 })).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
      frappeMessage: 'DocType Employee not found',
    })

    await expect(frappeRequest('/api/resource/Employee', { retries: 0 })).rejects.toBeInstanceOf(FrappeApiError)
  })
})
