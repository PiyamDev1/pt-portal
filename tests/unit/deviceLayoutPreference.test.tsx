import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_LAYOUT_COOKIE } from '@/lib/deviceLayout'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.success },
}))

import { DeviceLayoutPreference } from '@/app/dashboard/settings/components/DeviceLayoutPreference'

describe('DeviceLayoutPreference', () => {
  beforeEach(() => {
    mocks.refresh.mockReset()
    mocks.success.mockReset()
    document.cookie = `${DEVICE_LAYOUT_COOKIE}=; Path=/; Max-Age=0`
    document.documentElement.dataset.deviceLayout = 'desktop'
    delete document.documentElement.dataset.deviceLayoutPreference
  })

  it('switches the current browser from desktop to mobile and persists the override', async () => {
    render(<DeviceLayoutPreference />)

    const switchButton = await screen.findByRole('button', { name: 'Switch to Mobile' })
    fireEvent.click(switchButton)

    expect(document.documentElement.dataset.deviceLayout).toBe('mobile')
    expect(document.cookie).toContain(`${DEVICE_LAYOUT_COOKIE}=mobile`)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: 'Switch to Desktop' })).toBeTruthy()
  })

  it('restores automatic operating-system detection after a manual selection', async () => {
    document.cookie = `${DEVICE_LAYOUT_COOKIE}=desktop; Path=/`
    render(<DeviceLayoutPreference />)

    const resetButton = await screen.findByRole('button', { name: 'Use device default' })
    fireEvent.click(resetButton)

    await waitFor(() => expect(document.cookie).not.toContain(`${DEVICE_LAYOUT_COOKIE}=`))
    expect(document.documentElement.dataset.deviceLayoutPreference).toBe('automatic')
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
