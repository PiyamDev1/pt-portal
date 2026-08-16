import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchGet: vi.fn(),
  getUserIdentities: vi.fn(),
  unlinkIdentity: vi.fn(),
  linkIdentity: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => ({ get: mocks.searchGet }),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))

import { MicrosoftIdentityPanel } from '@/app/dashboard/settings/components/MicrosoftIdentityPanel'

describe('MicrosoftIdentityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchGet.mockReturnValue(null)
    mocks.getUserIdentities.mockResolvedValue({ data: { identities: [] }, error: null })
    mocks.linkIdentity.mockResolvedValue({
      data: { provider: 'azure', url: 'https://login.microsoftonline.com/' },
      error: null,
    })
  })

  it('starts an authenticated Azure identity-link flow for the current IMS email', async () => {
    render(
      <MicrosoftIdentityPanel
        currentUser={{ id: 'user-1', email: 'staff@piyamtravel.com' }}
        supabase={
          {
            auth: {
              getUserIdentities: mocks.getUserIdentities,
              unlinkIdentity: mocks.unlinkIdentity,
              linkIdentity: mocks.linkIdentity,
            },
          } as never
        }
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Link Microsoft work account' }))

    await waitFor(() => expect(mocks.linkIdentity).toHaveBeenCalledOnce())
    const request = mocks.linkIdentity.mock.calls[0][0]
    expect(request).toMatchObject({
      provider: 'azure',
      options: {
        scopes: 'email',
        queryParams: {
          login_hint: 'staff@piyamtravel.com',
          prompt: 'select_account',
        },
      },
    })

    const redirect = new URL(request.options.redirectTo)
    expect(redirect.pathname).toBe('/auth/callback')
    expect(redirect.searchParams.get('flow')).toBe('link-microsoft')
    expect(redirect.searchParams.get('next')).toBe('/dashboard/settings?tab=security')
  })

  it('shows the linked Microsoft email and does not offer a second link', async () => {
    mocks.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          {
            id: 'azure-1',
            identity_id: 'azure-1',
            user_id: 'user-1',
            provider: 'azure',
            identity_data: { email: 'staff@piyamtravel.com' },
            created_at: '2026-08-16T00:00:00Z',
          },
        ],
      },
      error: null,
    })

    render(
      <MicrosoftIdentityPanel
        currentUser={{ id: 'user-1', email: 'staff@piyamtravel.com' }}
        supabase={
          {
            auth: {
              getUserIdentities: mocks.getUserIdentities,
              unlinkIdentity: mocks.unlinkIdentity,
              linkIdentity: mocks.linkIdentity,
            },
          } as never
        }
      />,
    )

    expect(await screen.findByText('Microsoft sign-in is linked')).toBeTruthy()
    expect(screen.getByText('staff@piyamtravel.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Link Microsoft work account' })).toBeNull()
  })
})
