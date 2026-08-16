import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MOBILE_NAVIGATION_METADATA_KEY,
  MOBILE_NAVIGATION_UPDATED_EVENT,
} from '@/lib/mobileNavigation'

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))

import { MobileNavigationPreferences } from '@/app/dashboard/settings/components/MobileNavigationPreferences'

describe('MobileNavigationPreferences', () => {
  beforeEach(() => {
    mocks.success.mockReset()
    mocks.error.mockReset()
    mocks.updateUser.mockReset().mockResolvedValue({ error: null })
  })

  it('saves three ordered shortcuts and broadcasts the update to the bottom menu', async () => {
    const updated = vi.fn()
    window.addEventListener(MOBILE_NAVIGATION_UPDATED_EVENT, updated)

    render(
      <MobileNavigationPreferences
        currentUser={{
          id: 'user-1',
          email: 'staff@example.com',
          user_metadata: {
            [MOBILE_NAVIGATION_METADATA_KEY]: ['packages', 'bookings', 'timeclock'],
          },
        }}
        userRole="Employee"
        supabase={{ auth: { updateUser: mocks.updateUser } } as never}
      />,
    )

    const selects = screen.getAllByRole('combobox')
    expect(selects.map((select) => (select as HTMLSelectElement).value)).toEqual([
      'packages',
      'bookings',
      'timeclock',
    ])

    fireEvent.change(selects[0], { target: { value: 'training' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save mobile shortcuts' }))

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { [MOBILE_NAVIGATION_METADATA_KEY]: ['training', 'bookings', 'timeclock'] },
      }),
    )
    expect(updated).toHaveBeenCalledOnce()
    expect((updated.mock.calls[0][0] as CustomEvent).detail).toEqual([
      'training',
      'bookings',
      'timeclock',
    ])
    expect(mocks.success).toHaveBeenCalledWith('Mobile navigation updated')

    window.removeEventListener(MOBILE_NAVIGATION_UPDATED_EVENT, updated)
  })
})
