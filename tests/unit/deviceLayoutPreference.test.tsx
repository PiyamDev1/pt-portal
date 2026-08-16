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
    delete document.documentElement.dataset.mobileViewportCompensation
    document.documentElement.removeAttribute('style')
    document.querySelector('meta[name="viewport"]')?.remove()
  })

  it('switches the current browser from desktop to mobile and persists the override', async () => {
    render(<DeviceLayoutPreference />)

    const switchButton = await screen.findByRole('button', { name: 'Switch to Mobile' })
    fireEvent.click(switchButton)

    expect(document.documentElement.dataset.deviceLayout).toBe('mobile')
    expect(document.cookie).toContain(`${DEVICE_LAYOUT_COOKIE}=mobile`)
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain(
      'width=430',
    )
    expect(document.documentElement.dataset.mobileViewportCompensation).toBe('true')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-scale')).not.toBe('')
    expect(document.documentElement.style.getPropertyValue('--mobile-compensated-width')).toBe('')
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
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain(
      'width=device-width',
    )
    expect(document.documentElement.dataset.mobileViewportCompensation).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-scale')).toBe('')
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
