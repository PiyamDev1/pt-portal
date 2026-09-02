import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  fetch: vi.fn(),
  error: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.error, warning: vi.fn() },
}))

vi.mock('@/lib/auth/browserSupabase', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
    },
  }),
}))

import NewPasswordPage from '@/app/auth/new-password/page'

describe('NewPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'staff@example.com' } },
      error: null,
    })
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    vi.stubGlobal('fetch', mocks.fetch)
  })

  it('submits the temporary password with the chosen new password', async () => {
    render(<NewPasswordPage />)

    const currentPassword = await screen.findByLabelText('Temporary or current password')
    fireEvent.change(currentPassword, { target: { value: 'Temporary1!' } })
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'StrongerPass1!' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'StrongerPass1!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply secure password' }))

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'Temporary1!',
        newPassword: 'StrongerPass1!',
      }),
    })
  })
})
